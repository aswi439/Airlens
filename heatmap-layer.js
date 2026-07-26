/* ==========================================================================
   AirLens — Pollutant Heatmap Layer (additive; safe to remove)
   Adds click-to-select + IDW-interpolated pollutant heatmap on Leaflet map.
   Depends on: leaflet.min.js, leaflet-heat, and globals from air-pollution.js
   (leafletMap, cityAreas, aqiColor, getPollColor, aqiLabel, POLL_COLOR_LABEL,
   limits, updateLeafletMap).
   ========================================================================== */
(function () {
  'use strict';

  // ------- State -------
  let heatLayer = null;
  let selectedPoint = null;      // { lat, lng }
  let selectionRadiusKm = 5;
  let selectionMarker = null;
  let selectionCircle = null;
  let heatmapVisible = true;
  let infoCardEl = null;
  let controlPanelEl = null;
  let legendEl = null;
  let mapClickBound = false;
  let lastStationsUsed = [];

  const POLL_UNITS = {
    aqi: 'AQI', pm25: 'µg/m³ PM2.5', pm10: 'µg/m³ PM10',
    no2: 'µg/m³ NO₂', o3: 'µg/m³ O₃', so2: 'µg/m³ SO₂', co: 'mg/m³ CO'
  };

  // ------- Helpers -------
  function currentType() {
    const s = document.getElementById('pollSelect');
    return (s && s.value) ? s.value : 'aqi';
  }
  function limitFor(type) {
    if (type === 'aqi') return 300;
    return (window.limits && window.limits[type]) ? window.limits[type] : 150;
  }
  function stationValue(area, type) {
    if (type === 'aqi') return area.aqi;
    let v = area[type];
    if (v == null) {
      if (type === 'pm25') v = Math.round(area.aqi * 0.4);
      else if (type === 'pm10') v = Math.round(area.aqi * 0.7);
      else if (type === 'no2') v = Math.round(area.aqi * 0.25);
      else if (type === 'o3')  v = Math.round(area.aqi * 0.35);
      else if (type === 'so2') v = Math.round(area.aqi * 0.15);
      else if (type === 'co')  v = +(area.aqi * 0.02).toFixed(1);
      else v = 0;
    }
    return v;
  }
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bandColor(type, v) {
    if (type === 'aqi' && typeof window.aqiColor === 'function') return window.aqiColor(v);
    if (typeof window.getPollColor === 'function') return window.getPollColor(type, v);
    return '#00e676';
  }
  function bandLabel(type, v) {
    if (type === 'aqi' && typeof window.aqiLabel === 'function') return window.aqiLabel(v);
    const c = bandColor(type, v);
    return (window.POLL_COLOR_LABEL && window.POLL_COLOR_LABEL[c]) || 'Good';
  }

  // ------- Core: IDW grid generation -------
  function generateHeatmapData(lat, lng, radiusKm, type) {
    if (!window.cityAreas || !window.cityAreas.length) return { points: [], stations: [], nearest: [] };

    // 1) find stations within radius
    const all = window.cityAreas.map(s => ({ ...s, _d: haversineKm(lat, lng, s.lat, s.lng) }));
    let stations = all.filter(s => s._d <= radiusKm);
    if (stations.length < 4) {
      stations = all.slice().sort((a,b) => a._d - b._d).slice(0, Math.min(6, all.length));
    }
    if (!stations.length) return { points: [], stations: [], nearest: [] };

    // 2) build 20x20 grid over bounding box of the selection circle
    const N = 20;
    // ~1 deg lat = 111 km; lng scales with cos(lat)
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);
    const points = [];
    const lim = limitFor(type) || 1;

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const glat = lat - dLat + (2 * dLat) * (i / (N - 1));
        const glng = lng - dLng + (2 * dLng) * (j / (N - 1));
        const distFromCenter = haversineKm(lat, lng, glat, glng);
        if (distFromCenter > radiusKm) continue;

        // IDW
        let num = 0, den = 0, exactHit = null;
        for (const s of stations) {
          const d = haversineKm(glat, glng, s.lat, s.lng);
          if (d < 0.02) { exactHit = stationValue(s, type); break; }
          const w = 1 / (d * d);
          num += stationValue(s, type) * w;
          den += w;
        }
        const val = exactHit != null ? exactHit : (den > 0 ? num / den : 0);
        let intensity = Math.max(0, Math.min(1, val / lim));
        // soft edge fade
        const edgeFade = 1 - Math.pow(distFromCenter / radiusKm, 3);
        intensity *= Math.max(0, edgeFade);
        if (intensity > 0.02) points.push([glat, glng, intensity]);
      }
    }
    return { points, stations, nearest: stations.slice().sort((a,b)=>a._d-b._d) };
  }

  function interpolateAtPoint(lat, lng, type, stations) {
    if (!stations || !stations.length) return 0;
    let num = 0, den = 0;
    for (const s of stations) {
      const d = haversineKm(lat, lng, s.lat, s.lng);
      if (d < 0.02) return stationValue(s, type);
      const w = 1 / (d * d);
      num += stationValue(s, type) * w;
      den += w;
    }
    return den > 0 ? num / den : 0;
  }

  // ------- Rendering -------
  function renderHeatmap(points) {
    const map = window.leafletMap;
    if (!map || !window.L || !L.heatLayer) return;
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (!points.length) return;
    heatLayer = L.heatLayer(points, {
      radius: 35,
      blur: 25,
      maxZoom: 14,
      minOpacity: 0.35,
      gradient: {
        0.0: '#00e676',
        0.25: '#ffeb3b',
        0.5:  '#ff9800',
        0.75: '#f44336',
        1.0:  '#9c27b0'
      }
    });
    if (heatmapVisible) heatLayer.addTo(map);
  }

  function drawSelectionMarker(lat, lng) {
    const map = window.leafletMap;
    if (!map) return;
    if (selectionMarker) { selectionMarker.remove(); selectionMarker = null; }
    if (selectionCircle) { selectionCircle.remove(); selectionCircle = null; }

    const icon = L.divIcon({
      className: 'airlens-heatmap-selection-icon',
      html: `<div class="al-heat-pin"><span class="al-heat-pin-core"></span><span class="al-heat-pin-ring"></span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    selectionMarker = L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(map);
    selectionCircle = L.circle([lat, lng], {
      radius: selectionRadiusKm * 1000,
      color: '#8ecbff', weight: 1.4, opacity: 0.85,
      fillColor: '#8ecbff', fillOpacity: 0.06,
      interactive: false
    }).addTo(map);
  }

  function renderInfoCard(lat, lng, type, stations) {
    if (!infoCardEl) return;
    const val = interpolateAtPoint(lat, lng, type, stations);
    const rounded = type === 'co' ? val.toFixed(1) : Math.round(val);
    const color = bandColor(type, val);
    const label = bandLabel(type, val);
    const unit = POLL_UNITS[type] || '';
    const nearest = stations.slice().sort((a,b)=>a._d-b._d).slice(0, 5);
    infoCardEl.innerHTML = `
      <div class="al-heat-info-head">
        <div class="al-heat-info-title">Selected location</div>
        <button class="al-heat-info-close" title="Clear selection">×</button>
      </div>
      <div class="al-heat-info-coords">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
      <div class="al-heat-info-value" style="color:${color};">${rounded}<span class="al-heat-info-unit"> ${unit}</span></div>
      <div class="al-heat-info-label" style="color:${color};">${label}</div>
      <div class="al-heat-info-sub">Estimated from ${nearest.length} nearby station${nearest.length===1?'':'s'} (IDW)</div>
      <ul class="al-heat-info-stations">
        ${nearest.map(s => `<li><span>${s.name}</span><span>${s._d.toFixed(1)} km</span></li>`).join('')}
      </ul>
    `;
    infoCardEl.style.display = 'block';
    const closeBtn = infoCardEl.querySelector('.al-heat-info-close');
    if (closeBtn) closeBtn.onclick = clearHeatmapSelection;
  }

  function renderLegend(type) {
    if (!legendEl) return;
    const unit = POLL_UNITS[type] || '';
    const bands = [
      ['#00e676', 'Good'],
      ['#ffeb3b', 'Moderate'],
      ['#ff9800', 'Sensitive'],
      ['#f44336', 'Unhealthy'],
      ['#9c27b0', 'V. Unhealthy'],
      ['#7e0023', 'Hazardous']
    ];
    legendEl.innerHTML = `
      <div class="al-heat-legend-title">${unit}</div>
      <div class="al-heat-legend-bar">
        ${bands.map(b => `<span style="background:${b[0]}"></span>`).join('')}
      </div>
      <div class="al-heat-legend-labels">
        <span>${bands[0][1]}</span><span>${bands[bands.length-1][1]}</span>
      </div>`;
  }

  // ------- Public API -------
  function generateHeatmap() {
    if (!selectedPoint) return;
    const type = currentType();
    const { points, stations, nearest } = generateHeatmapData(
      selectedPoint.lat, selectedPoint.lng, selectionRadiusKm, type
    );
    lastStationsUsed = nearest;
    if (!points.length || !stations.length) {
      if (heatLayer) { window.leafletMap.removeLayer(heatLayer); heatLayer = null; }
      if (infoCardEl) {
        infoCardEl.innerHTML = `
          <div class="al-heat-info-head">
            <div class="al-heat-info-title">Selected location</div>
            <button class="al-heat-info-close" title="Clear selection">×</button>
          </div>
          <div class="al-heat-info-empty">Not enough nearby station data to estimate this area.</div>`;
        infoCardEl.style.display = 'block';
        const c = infoCardEl.querySelector('.al-heat-info-close');
        if (c) c.onclick = clearHeatmapSelection;
      }
      renderLegend(type);
      return;
    }
    renderHeatmap(points);
    renderInfoCard(selectedPoint.lat, selectedPoint.lng, type, stations);
    renderLegend(type);
  }

  function onMapClickForHeatmap(e) {
    if (!e || !e.latlng) return;
    // ignore clicks on markers/popups
    if (e.originalEvent && e.originalEvent.target) {
      const t = e.originalEvent.target;
      if (t.closest && (t.closest('.leaflet-marker-icon') || t.closest('.leaflet-popup'))) return;
    }
    selectedPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
    drawSelectionMarker(selectedPoint.lat, selectedPoint.lng);
    generateHeatmap();
  }

  function refreshHeatmapForCurrentSelection() {
    if (!selectedPoint) return;
    generateHeatmap();
  }

  function clearHeatmapSelection() {
    const map = window.leafletMap;
    if (heatLayer && map) { map.removeLayer(heatLayer); }
    heatLayer = null;
    if (selectionMarker) selectionMarker.remove();
    if (selectionCircle) selectionCircle.remove();
    selectionMarker = null; selectionCircle = null;
    selectedPoint = null;
    lastStationsUsed = [];
    if (infoCardEl) { infoCardEl.style.display = 'none'; infoCardEl.innerHTML = ''; }
  }

  function toggleHeatmapVisibility(show) {
    heatmapVisible = !!show;
    const map = window.leafletMap;
    if (!map) return;
    if (heatmapVisible) {
      if (heatLayer && !map.hasLayer(heatLayer)) heatLayer.addTo(map);
      else if (!heatLayer && selectedPoint) generateHeatmap();
    } else if (heatLayer && map.hasLayer(heatLayer)) {
      map.removeLayer(heatLayer);
    }
  }

  function setRadius(km) {
    selectionRadiusKm = km;
    if (selectionCircle) selectionCircle.setRadius(km * 1000);
    if (selectedPoint) generateHeatmap();
    // update active state
    if (controlPanelEl) {
      controlPanelEl.querySelectorAll('[data-radius]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.radius) === km);
      });
    }
  }

  // ------- UI: control panel + legend + info card -------
  function buildUI() {
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl) return;
    // ensure host is positioned
    const hostStyle = getComputedStyle(mapEl.parentElement || mapEl);
    if (mapEl.parentElement && hostStyle.position === 'static') {
      mapEl.parentElement.style.position = 'relative';
    }
    const host = mapEl.parentElement || mapEl;

    if (!controlPanelEl) {
      controlPanelEl = document.createElement('div');
      controlPanelEl.className = 'al-heat-panel';
      controlPanelEl.innerHTML = `
        <div class="al-heat-panel-row">
          <label class="al-heat-toggle">
            <input type="checkbox" id="alHeatToggle" checked />
            <span class="al-heat-toggle-slider"></span>
            <span class="al-heat-toggle-label">Show Heatmap</span>
          </label>
        </div>
        <div class="al-heat-panel-row al-heat-radii">
          <span class="al-heat-panel-hint">Radius</span>
          <button data-radius="3">3 km</button>
          <button data-radius="5" class="active">5 km</button>
          <button data-radius="10">10 km</button>
        </div>
        <div class="al-heat-legend"></div>
        <div class="al-heat-panel-hint al-heat-panel-tip">Click the map to select an area</div>
      `;
      host.appendChild(controlPanelEl);
      legendEl = controlPanelEl.querySelector('.al-heat-legend');
      renderLegend(currentType());

      controlPanelEl.querySelector('#alHeatToggle').addEventListener('change', (ev) => {
        toggleHeatmapVisibility(ev.target.checked);
      });
      controlPanelEl.querySelectorAll('[data-radius]').forEach(btn => {
        btn.addEventListener('click', () => setRadius(Number(btn.dataset.radius)));
      });
    }

    if (!infoCardEl) {
      infoCardEl = document.createElement('div');
      infoCardEl.className = 'al-heat-info';
      infoCardEl.style.display = 'none';
      host.appendChild(infoCardEl);
    }
  }

  // ------- Boot: wait for map + leaflet-heat, wire everything -------
  function bindMap() {
    const map = window.leafletMap;
    if (!map || mapClickBound) return;
    map.on('click', onMapClickForHeatmap);
    mapClickBound = true;
  }

  function wrapUpdateLeafletMap() {
    if (typeof window.updateLeafletMap !== 'function' || window.updateLeafletMap.__heatWrapped) return;
    const orig = window.updateLeafletMap;
    const wrapped = function (type) {
      const r = orig.apply(this, arguments);
      try { refreshHeatmapForCurrentSelection(); } catch (e) {}
      try { renderLegend(type || currentType()); } catch (e) {}
      return r;
    };
    wrapped.__heatWrapped = true;
    window.updateLeafletMap = wrapped;
  }

  function waitAndBoot() {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window.leafletMap && window.L && window.L.heatLayer) {
        clearInterval(iv);
        buildUI();
        bindMap();
        wrapUpdateLeafletMap();
      } else if (tries > 120) { // ~24s
        clearInterval(iv);
      }
    }, 200);
  }

  // Expose API
  window.AirLensHeatmap = {
    onMapClickForHeatmap,
    generateHeatmapData,
    renderHeatmap,
    refreshHeatmapForCurrentSelection,
    clearHeatmapSelection,
    toggleHeatmapVisibility,
    setRadius
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndBoot);
  } else {
    waitAndBoot();
  }
})();
