/*
 * AirLens – Phase 1 Industry Intelligence
 * Additive layer for the existing Leaflet map. Does NOT modify any existing
 * dashboard code. Reads industries from the AirLens backend and drops markers
 * on `window.leafletMap` once it is initialized.
 *
 * Configure the backend URL by setting `window.AIRLENS_BACKEND_URL` BEFORE
 * this script loads, e.g.
 *   <script>window.AIRLENS_BACKEND_URL = "http://localhost:8787";</script>
 */
(function () {
  'use strict';

  const BACKEND = (window.AIRLENS_BACKEND_URL || 'http://localhost:8787').replace(/\/$/, '');

  let industryLayer = null;
  let industryMarkers = [];
  let loaded = false;

  function log() { try { console.log.apply(console, ['[industry-layer]', ...arguments]); } catch (_) {} }

  async function fetchIndustries() {
    const url = `${BACKEND}/industries?limit=100000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    const json = await res.json();
    return (json.items || []).filter(x => x.latitude != null && x.longitude != null);
  }

  function popupHtml(ind) {
    const meta = ind.metadata || {};
    const website = meta.website ? `<a href="${meta.website}" target="_blank" rel="noopener">Website</a>` : '';
    const phone   = meta.phone ? `<div><strong>Phone:</strong> ${meta.phone}</div>` : '';
    const gmaps   = `https://www.google.com/maps/search/?api=1&query=${ind.latitude},${ind.longitude}`;
    return `
      <div style="min-width:220px;font-family:system-ui,sans-serif;font-size:12px;line-height:1.4;">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${escapeHtml(ind.industry_name || 'Industry')}</div>
        <div><strong>Category:</strong> ${escapeHtml(ind.category || '—')}</div>
        ${ind.address ? `<div><strong>Address:</strong> ${escapeHtml(ind.address)}</div>` : ''}
        <div><strong>Coords:</strong> ${Number(ind.latitude).toFixed(5)}, ${Number(ind.longitude).toFixed(5)}</div>
        <div><strong>Place ID:</strong> <code style="font-size:11px;">${escapeHtml(ind.place_id || '')}</code></div>
        ${phone}
        <div style="margin-top:6px;display:flex;gap:8px;">
          ${website}
          <a href="${gmaps}" target="_blank" rel="noopener">Open in Google Maps</a>
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function industryIcon() {
    if (!window.L) return null;
    return L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:3px;background:#f59e0b;border:2px solid #78350f;box-shadow:0 0 0 1px rgba(0,0,0,0.35);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  async function renderOntoMap(map) {
    if (!map || !window.L) return;
    if (loaded) return;
    try {
      const items = await fetchIndustries();
      industryLayer = L.layerGroup().addTo(map);
      const icon = industryIcon();
      items.forEach(ind => {
        const m = L.marker([ind.latitude, ind.longitude], { 
          icon, 
          title: ind.industry_name || 'Industry',
          zIndexOffset: 10000 
        })
          .bindPopup(popupHtml(ind));
        m.addTo(industryLayer);
        industryMarkers.push(m);
      });
      loaded = true;
      log(`rendered ${items.length} industries`);
      // Expose a simple layer-toggle for future UI wiring.
      window.AirLensIndustries = {
        show: () => industryLayer && industryLayer.addTo(map),
        hide: () => industryLayer && map.removeLayer(industryLayer),
        reload: async () => {
          if (industryLayer) map.removeLayer(industryLayer);
          industryMarkers = []; loaded = false;
          await renderOntoMap(map);
        },
        sync: async (opts) => {
          const res = await fetch(`${BACKEND}/industries/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts || { city: 'Chennai', radius: 20000, maxResults: 200 }),
          });
          const data = await res.json();
          log('sync result', data);
          await window.AirLensIndustries.reload();
          return data;
        },
      };
    } catch (err) {
      log('failed to load industries:', err.message);
    }
  }

  // Poll for the existing `leafletMap` global set by air-pollution.js. Cheap
  // and avoids monkey-patching initLeafletMap().
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.leafletMap) {
      clearInterval(iv);
      renderOntoMap(window.leafletMap);
    } else if (Date.now() - t0 > 60000) {
      clearInterval(iv);
      log('timed out waiting for leafletMap');
    }
  }, 500);
})();
