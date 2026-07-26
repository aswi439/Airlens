/* ═══════════════════════════════════════════════════════════
   ChennAIR — Dashboard redesign behaviour
   · sidebar drawer toggle
   · AQI arc gauge (needle + ticks)
   · left/right hero stat boxes fed from live data
   · pollutant 3D card-stack fan carousel
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── SIDEBAR DRAWER ─────────────────────────────────────── */
  window.toggleSidebar = function (force) {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    var open = (typeof force === 'boolean') ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    document.body.classList.toggle('sidebar-open', open);
  };

  // the legacy outside-click handler closes the drawer unless the click is a
  // .menu-btn — keep our floating button's click from reaching it
  document.addEventListener('DOMContentLoaded', function () {
    var fb = document.getElementById('floatingMenuBtn');
    if (fb) fb.addEventListener('click', function (e) { e.stopPropagation(); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.toggleSidebar(false);
  });

  // close the drawer after picking a page
  document.addEventListener('click', function (e) {
    var item = e.target.closest && e.target.closest('.sidebar .nav-item');
    if (item) setTimeout(function () { window.toggleSidebar(false); }, 120);
  });

  /* ── HELPERS ────────────────────────────────────────────── */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  function txt(id) {
    var el = document.getElementById(id);
    return el ? num(el.textContent) : null;
  }

  function aqiHue(v) {
    if (v == null) return '#8ea0b0';
    if (v <= 50) return '#00e676';
    if (v <= 100) return '#ffeb3b';
    if (v <= 150) return '#ff9800';
    if (v <= 200) return '#f44336';
    if (v <= 300) return '#9c27b0';
    return '#7b1fa2';
  }

  function levelFor(kind, v) {
    if (v == null) return { label: '—', color: '#8ea0b0' };
    var b = {
      pm25: [12, 35, 55, 150],
      pm10: [54, 154, 254, 354],
      no2: [40, 80, 180, 280],
      so2: [40, 80, 380, 800],
      o3: [50, 100, 168, 208],
      co: [4.4, 9.4, 12.4, 15.4]
    }[kind] || [50, 100, 150, 200];
    if (v <= b[0]) return { label: 'Good', color: '#00e676' };
    if (v <= b[1]) return { label: 'Moderate', color: '#ffeb3b' };
    if (v <= b[2]) return { label: 'Unhealthy', color: '#ff9800' };
    if (v <= b[3]) return { label: 'Very Unhealthy', color: '#f44336' };
    return { label: 'Hazardous', color: '#9c27b0' };
  }

  function live(key) {
    var L = window.LiveData || {};
    var v = num(L[key]);
    if (v != null && !isNaN(v)) return v;
    var aqi = num(L.aqi) || 72;
    var defaults = {
      pm25: Math.round(aqi * 0.35),
      pm10: Math.round(aqi * 0.65),
      no2: Math.round(aqi * 0.25),
      o3: Math.round(aqi * 0.18),
      so2: Math.round(aqi * 0.08),
      co: parseFloat((aqi * 0.01).toFixed(1))
    };
    return defaults[key] != null ? defaults[key] : 15;
  }

  /* ── ARC GAUGE ──────────────────────────────────────────── */
  var GAUGE_MAX = 300;

  function buildTicks() {
    var g = document.getElementById('gv3Ticks');
    if (!g || g.childNodes.length) return;
    var NS = 'http://www.w3.org/2000/svg';
    for (var v = 0; v <= GAUGE_MAX; v += 25) {
      var major = v % 50 === 0;
      var a = Math.PI + (v / GAUGE_MAX) * Math.PI;
      var r1 = 130, r2 = major ? 142 : 137;
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', (150 + r1 * Math.cos(a)).toFixed(1));
      line.setAttribute('y1', (165 + r1 * Math.sin(a)).toFixed(1));
      line.setAttribute('x2', (150 + r2 * Math.cos(a)).toFixed(1));
      line.setAttribute('y2', (165 + r2 * Math.sin(a)).toFixed(1));
      line.setAttribute('stroke', 'rgba(255,255,255,.35)');
      line.setAttribute('stroke-width', major ? '2' : '1');
      line.setAttribute('stroke-linecap', 'round');
      g.appendChild(line);

      if (major && v > 0 && v < GAUGE_MAX) {
        var t = document.createElementNS(NS, 'text');
        var r3 = 157;
        t.setAttribute('x', (150 + r3 * Math.cos(a)).toFixed(1));
        t.setAttribute('y', (165 + r3 * Math.sin(a) + 4).toFixed(1));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'gv3-tick-label');
        t.textContent = v;
        g.appendChild(t);
      }
    }
  }

  function renderGauge(aqi) {
    var needle = document.getElementById('gv3Needle');
    if (!needle) return;
    var v = aqi == null ? 0 : Math.max(0, Math.min(GAUGE_MAX, aqi));
    var deg = -90 + (v / GAUGE_MAX) * 180;
    needle.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' 150 165)');
  }

  /* ── HERO BOXES ─────────────────────────────────────────── */
  function paint(id, value, decimals) {
    var el = document.getElementById(id);
    if (!el || value == null) return;
    el.textContent = decimals ? value.toFixed(decimals) : Math.round(value);
  }

  function paintStatus(id, kind, value) {
    var el = document.getElementById(id);
    if (!el || value == null) return;
    var lv = levelFor(kind, value);
    el.textContent = lv.label;
    el.style.color = lv.color;
  }

  function syncHero() {
    var aqi = live('aqi');
    if (aqi == null) aqi = txt('gaugeNum');
    renderGauge(aqi);

    var pm25 = live('pm25'), pm10 = live('pm10'), co = live('co');
    paint('pm25Val', pm25); paintStatus('pm25Status', 'pm25', pm25);
    paint('pm10Val', pm10); paintStatus('pm10Status', 'pm10', pm10);
    paint('heroCoVal', co, 1); paintStatus('heroCoStatus', 'co', co);

    // MIN / MAX dots follow the AQI band
    if (aqi != null) {
      var mn = document.getElementById('minAqiToday');
      var mx = document.getElementById('maxAqiToday');
      if (mn && mn.querySelector('.asr-dot')) mn.querySelector('.asr-dot').style.background = aqiHue(Math.round(aqi * 0.55));
      if (mx && mx.querySelector('.asr-dot')) mx.querySelector('.asr-dot').style.background = aqiHue(Math.round(aqi * 1.35));
    }
    var t = document.getElementById('ovTime');
    if (t) t.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ── POLLUTANT CARD STACK ───────────────────────────────── */
  var POLLUTANTS = [
    { key: 'co',   label: 'CO',    name: 'Carbon Monoxide',              unit: 'ppm',   icon: 'CO', c1: 'rgba(0,230,118,.55)',  c2: 'rgba(0,120,80,.5)',   line: '#00e676' },
    { key: 'pm10', label: 'PM10',  name: 'Particulate Matter < 10µm',    unit: 'µg/m³', icon: '💧', c1: 'rgba(56,140,255,.55)', c2: 'rgba(20,60,160,.5)',  line: '#4d9bff' },
    { key: 'pm25', label: 'PM2.5', name: 'Particulate Matter < 2.5µm',   unit: 'µg/m³', icon: '🌫️', c1: 'rgba(0,200,220,.55)',  c2: 'rgba(10,80,130,.5)',  line: '#22d3ee' },
    { key: 'so2',  label: 'SO₂',   name: 'Sulfur Dioxide',               unit: 'ppb',   icon: '☁',  c1: 'rgba(240,190,60,.5)',  c2: 'rgba(140,90,10,.5)',  line: '#f5c542' },
    { key: 'o3',   label: 'O₃',    name: 'Ozone',                        unit: 'ppb',   icon: '🌀', c1: 'rgba(160,90,255,.55)', c2: 'rgba(80,30,150,.5)',  line: '#a855f7' },
    { key: 'no2',  label: 'NO₂',   name: 'Nitrogen Dioxide',             unit: 'ppb',   icon: '🔥', c1: 'rgba(255,70,90,.5)',   c2: 'rgba(140,15,40,.5)',  line: '#ff5470' }
  ];

  var active = 2, plane, dotsWrap, cards = [], history = {};

  function sparkPath(key, seed) {
    var pts = [], n = 12;
    history[key] = history[key] || [];
    for (var i = 0; i < n; i++) {
      var base = 22 + Math.sin((i + seed) * 0.9) * 7 + Math.cos((i + seed) * 1.7) * 4;
      pts.push([(i / (n - 1)) * 100, Math.max(4, Math.min(38, base))]);
    }
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  }

  function buildCards() {
    plane = document.getElementById('csPlane');
    dotsWrap = document.getElementById('csDots');
    if (!plane || cards.length) return;

    POLLUTANTS.forEach(function (p, i) {
      var el = document.createElement('article');
      el.className = 'cs-card';
      el.style.setProperty('--c1', p.c1);
      el.style.setProperty('--c2', p.c2);
      el.innerHTML =
        '<div class="cs-card-art"></div>' +
        '<svg class="cs-card-wave" viewBox="0 0 460 290" preserveAspectRatio="none" aria-hidden="true">' +
          '<path d="M-20 210 C 90 150, 170 250, 250 170 S 400 60, 480 110" fill="none" stroke="' + p.line + '" stroke-opacity=".55" stroke-width="2"/>' +
          '<path d="M-20 250 C 100 200, 190 280, 260 210 S 410 120, 480 160" fill="none" stroke="' + p.line + '" stroke-opacity=".28" stroke-width="1.4"/>' +
        '</svg>' +
        '<div class="cs-card-shade"></div>' +
        '<div class="cs-card-top">' +
          '<span class="cs-badge"><i>' + p.icon + '</i>' + p.label + '</span>' +
          '<span class="cs-tag" data-tag>—</span>' +
        '</div>' +
        '<div class="cs-card-body">' +
          '<div class="cs-name">' + p.name + '</div>' +
          '<div class="cs-figure"><b data-val>—</b><span>' + p.unit + '</span></div>' +
          '<div class="cs-desc" data-desc>Awaiting live reading…</div>' +
          '<div class="cs-spark-label">24H Trend</div>' +
          '<svg class="cs-spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">' +
            '<path d="' + sparkPath(p.key, i) + '" fill="none" stroke="' + p.line + '" stroke-width="1.6"/>' +
          '</svg>' +
        '</div>';
      el.addEventListener('click', function () {
        if (i !== active) { go(i); return; }
        openPollutantDetail(p, el);
      });
      plane.appendChild(el);
      cards.push(el);

      var dot = document.createElement('button');
      dot.className = 'cs-dot';
      dot.setAttribute('aria-label', 'Show ' + p.label);
      dot.addEventListener('click', function () { go(i); });
      dotsWrap.appendChild(dot);
    });

    layout();
    enableDrag();
  }

  function layout() {
    var len = POLLUTANTS.length;
    var wide = window.innerWidth > 900;
    var spacing = wide ? 250 : 170;
    var step = wide ? 11 : 9;

    cards.forEach(function (el, i) {
      var raw = i - active;
      var alt = raw > 0 ? raw - len : raw + len;
      var off = Math.abs(alt) < Math.abs(raw) ? alt : raw;
      var abs = Math.abs(off);
      var isActive = off === 0;

      el.classList.toggle('is-active', isActive);
      el.style.zIndex = String(100 - abs);
      el.style.opacity = abs > 2 ? '0' : '1';
      el.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      el.style.transform =
        'translate3d(' + (off * spacing) + 'px,' + (abs * 12 - (isActive ? 18 : 0)) + 'px,' + (-abs * 130) + 'px) ' +
        'rotateX(' + (isActive ? 0 : 9) + 'deg) rotateZ(' + (off * step) + 'deg) ' +
        'scale(' + (isActive ? 1.03 : 0.93) + ')';
    });

    Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
      d.classList.toggle('on', i === active);
    });
  }

  function go(i) {
    var len = POLLUTANTS.length;
    active = ((i % len) + len) % len;
    layout();
  }

  function enableDrag() {
    var startX = null;
    var stage = document.querySelector('.cs-stage');
    if (!stage) return;
    stage.addEventListener('pointerdown', function (e) { startX = e.clientX; });
    window.addEventListener('pointerup', function (e) {
      if (startX == null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 60) go(active + (dx < 0 ? 1 : -1));
    });

    var stack = document.getElementById('pollutantStack');
    if (stack) {
      stack.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') go(active - 1);
        if (e.key === 'ArrowRight') go(active + 1);
      });
    }
    var prev = document.getElementById('csPrev');
    var next = document.getElementById('csNext');
    if (prev) prev.addEventListener('click', function () { go(active - 1); });
    if (next) next.addEventListener('click', function () { go(active + 1); });
    window.addEventListener('resize', layout);
  }

  function syncCards() {
    if (!cards.length) return;
    POLLUTANTS.forEach(function (p, i) {
      var v = live(p.key);
      if (v == null) v = txt('pmr' + p.key.charAt(0).toUpperCase() + p.key.slice(1));
      var el = cards[i];
      var lv = levelFor(p.key, v);
      var valEl = el.querySelector('[data-val]');
      var tagEl = el.querySelector('[data-tag]');
      var descEl = el.querySelector('[data-desc]');
      if (v != null) {
        valEl.textContent = (p.key === 'co' || v < 10) ? v.toFixed(1) : Math.round(v);
        tagEl.textContent = lv.label;
        tagEl.style.color = lv.color;
        descEl.textContent = describe(p, v, lv.label);
      }
    });
  }

  function describe(p, v, label) {
    var where = (window.SELECTED_CITY || 'your area');
    return label + ' · ' + p.label + ' measured at ' + ((p.key === 'co' || v < 10) ? v.toFixed(1) : Math.round(v)) +
      ' ' + p.unit + ' across ' + where + '.';
  }

  /* ── DETAIL PAGE TRANSITION ─────────────────────────────── */
  function openPollutantDetail(p, cardEl) {
    try {
      var rect = cardEl.getBoundingClientRect();
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;opacity:0;transition:opacity 500ms ease;pointer-events:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(3,7,18,.85) 60%, rgba(3,7,18,.98) 100%);';
      var ghost = cardEl.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.margin = '0';
      ghost.style.transform = 'none';
      ghost.style.zIndex = '99999';
      ghost.style.willChange = 'transform, opacity';
      ghost.style.transition = 'transform 620ms cubic-bezier(.22,.9,.24,1), opacity 620ms ease, border-radius 620ms ease, box-shadow 620ms ease';
      overlay.appendChild(ghost);
      document.body.appendChild(overlay);
      // trigger the expand
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        var cx = window.innerWidth / 2 - (rect.left + rect.width / 2);
        var cy = window.innerHeight / 2 - (rect.top + rect.height / 2);
        var sx = (window.innerWidth * 1.4) / rect.width;
        var sy = (window.innerHeight * 1.4) / rect.height;
        var s = Math.max(sx, sy);
        ghost.style.transform = 'translate(' + cx + 'px,' + cy + 'px) scale(' + s + ')';
        ghost.style.opacity = '0.15';
        ghost.style.borderRadius = '0px';
        ghost.style.boxShadow = '0 0 120px 40px ' + (p.line || 'rgba(56,180,255,.4)');
      });
      setTimeout(function () {
        var city = window.SELECTED_CITY || (window.LiveData && window.LiveData.city) || '';
        var v = live(p.key);
        var aqi = live('aqi');
        var qs = 'type=' + encodeURIComponent(p.key) +
                 '&city=' + encodeURIComponent(city) +
                 '&value=' + encodeURIComponent(v == null ? '' : v) +
                 '&aqi=' + encodeURIComponent(aqi == null ? '' : aqi);
        window.location.href = 'pollutant.html?' + qs;
      }, 560);
    } catch (e) {
      window.location.href = 'pollutant.html?type=' + encodeURIComponent(p.key);
    }
  }

  /* ── BOOT ───────────────────────────────────────────────── */
  function boot() {
    buildTicks();
    buildCards();
    buildTicks();
    buildCards();
    syncHero();
    syncCards();
    setInterval(function () { syncHero(); syncCards(); }, 3000);

    var g = document.getElementById('gaugeNum');
    if (g && window.MutationObserver) {
      new MutationObserver(function () { syncHero(); syncCards(); })
        .observe(g, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
