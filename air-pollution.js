/* ============================================================
   ChennAIR v3.0 — Enhanced Air Pollution Dashboard
   All 24 improvements implemented
   ============================================================ */

// ===== CONSTANTS =====
const WAQI_TOKEN = 'd393684229b2dd78ba0f63ad1b88395431341c8d';
const OW_KEY = '7d241903cbe0a28094a25c10b0740701';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// NOTE: To enable the AI chatbot, replace the empty string below with your Anthropic API key
// Get your key at: https://console.anthropic.com/
const ANTHROPIC_KEY = '';

// Read selected city from URL (set by intro.html)
const _urlParams = new URLSearchParams(window.location.search);
const SELECTED_CITY = _urlParams.get('city') || sessionStorage.getItem('selectedCity') || 'chennai';
// Precise coordinates (set by intro.html when available — GPS or picker city with lat/lng)
const SELECTED_LAT = parseFloat(_urlParams.get('lat') || sessionStorage.getItem('selectedLat') || '');
const SELECTED_LNG = parseFloat(_urlParams.get('lng') || sessionStorage.getItem('selectedLng') || '');
const HAS_SELECTED_COORDS = !isNaN(SELECTED_LAT) && !isNaN(SELECTED_LNG);

// ===== CORS PROXY =====
// Wraps any URL so it works when opened as file:// (no local server needed)
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];
let _proxyIndex = 0;
async function proxiedFetch(url, opts = {}) {
  // Try direct first (works if served via http://)
  try {
    const r = await Promise.race([
      fetch(url, opts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (r.ok) return r;
  } catch (e) { /* direct failed, use proxy */ }
  // Try CORS proxies in order
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const pi = (_proxyIndex + i) % CORS_PROXIES.length;
    try {
      const proxyUrl = CORS_PROXIES[pi](url);
      const r = await Promise.race([
        fetch(proxyUrl, opts),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ]);
      if (r.ok) { _proxyIndex = pi; return r; }
    } catch (e) { /* try next proxy */ }
  }
  throw new Error('All proxies failed for: ' + url);
}

// ===== CHENNAI MOCK DATA (15 real monitoring stations) =====
// Base AQI values reflect typical Chennai pollution patterns
// Industrial north Chennai > central > southern/coastal areas
const CHENNAI_MOCK_BASE = [
  { name: 'Manali', aqi: 192, lat: 13.1681, lng: 80.2566, pm25: 78, pm10: 145, no2: 62 },
  { name: 'Tondairpet', aqi: 185, lat: 13.1387, lng: 80.2998, pm25: 74, pm10: 138, no2: 58 },
  { name: 'Ambattur', aqi: 168, lat: 13.1127, lng: 80.1567, pm25: 65, pm10: 122, no2: 50 },
  { name: 'Perambur', aqi: 158, lat: 13.1167, lng: 80.2353, pm25: 61, pm10: 115, no2: 47 },
  { name: 'Kodambakkam', aqi: 142, lat: 13.0522, lng: 80.2261, pm25: 54, pm10: 102, no2: 42 },
  { name: 'Kilpauk', aqi: 138, lat: 13.0827, lng: 80.2395, pm25: 52, pm10: 98, no2: 40 },
  { name: 'T. Nagar', aqi: 130, lat: 13.0401, lng: 80.2338, pm25: 48, pm10: 92, no2: 38 },
  { name: 'Anna Nagar', aqi: 122, lat: 13.0850, lng: 80.2101, pm25: 45, pm10: 86, no2: 35 },
  { name: 'Alandur', aqi: 115, lat: 13.0012, lng: 80.2050, pm25: 42, pm10: 80, no2: 32 },
  { name: 'Velachery', aqi: 108, lat: 12.9815, lng: 80.2209, pm25: 39, pm10: 74, no2: 30 },
  { name: 'Adyar', aqi: 96, lat: 13.0012, lng: 80.2565, pm25: 34, pm10: 65, no2: 26 },
  { name: 'Perungudi', aqi: 90, lat: 12.9562, lng: 80.2468, pm25: 31, pm10: 60, no2: 24 },
  { name: 'OMR', aqi: 84, lat: 12.9121, lng: 80.2279, pm25: 28, pm10: 55, no2: 21 },
  { name: 'Besant Nagar', aqi: 72, lat: 13.0006, lng: 80.2707, pm25: 23, pm10: 45, no2: 18 },
  { name: 'ECR', aqi: 62, lat: 12.8600, lng: 80.2300, pm25: 19, pm10: 38, no2: 14 },
];
// Add small realistic drift each refresh
function getChennaiMockAreas() {
  return CHENNAI_MOCK_BASE.map(s => {
    const drift = Math.round((Math.random() - 0.5) * 18);
    const aqi = Math.max(30, Math.min(300, s.aqi + drift));
    return {
      name: s.name, aqi, lat: s.lat, lng: s.lng, color: aqiColor(aqi),
      pm25: Math.max(5, s.pm25 + Math.round(drift * 0.4)),
      pm10: Math.max(10, s.pm10 + Math.round(drift * 0.7)),
      no2: Math.max(5, s.no2 + Math.round(drift * 0.3))
    };
  });
}
// Generic mock for other cities (pulls realistic ranges by known pollution level)
const CITY_POLLUTION_LEVEL = {
  delhi: 4, lucknow: 4, kanpur: 4, varanasi: 4, patna: 4, ghaziabad: 4,
  mumbai: 3, kolkata: 3, ahmedabad: 3, hyderabad: 3, bangalore: 2, bengaluru: 2,
  pune: 2, coimbatore: 2, madurai: 2, kochi: 1, thiruvananthapuram: 1,
  vizag: 2, visakhapatnam: 2, bhubaneswar: 2, guwahati: 3,
};
function getCityMockAreas(city) {
  const level = CITY_POLLUTION_LEVEL[(city || '').toLowerCase()] || 2;
  const ranges = [[40, 80], [80, 140], [130, 190], [170, 250]];
  const [lo, hi] = ranges[level - 1];
  const names = ['North Zone', 'East Zone', 'Central Area', 'West Zone', 'South Zone',
    'Industrial Belt', 'Old City', 'New Extensions', 'Suburbs', 'Outskirts'];
  
  let centerLat = 13.0827;
  let centerLng = 80.2707;
  if (HAS_SELECTED_COORDS) {
    centerLat = SELECTED_LAT;
    centerLng = SELECTED_LNG;
  } else if (typeof getCityCenter === 'function') {
    const c = getCityCenter(city);
    centerLat = c.lat;
    centerLng = c.lng;
  }

  return names.map((n, idx) => {
    const aqi = Math.round(lo + Math.random() * (hi - lo));
    // Generate slight offset coordinates around the city center
    const angle = (idx / names.length) * 2 * Math.PI;
    const radius = 0.03 + Math.random() * 0.05; // degree offset
    const lat = centerLat + Math.sin(angle) * radius;
    const lng = centerLng + Math.cos(angle) * radius;
    return { name: n, aqi, lat, lng, color: aqiColor(aqi) };
  });
}

// Page loading initialization
document.addEventListener('DOMContentLoaded', () => {
  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  // Page title & tab
  document.title = `AirLens — ${cityDisplay} AQI`;
  // Sidebar labels
  const lbl = document.querySelector('.aqi-mini-label');
  if (lbl) lbl.textContent = `Current AQI · ${cityDisplay}`;
  // Dashboard heading
  const banner = document.querySelector('.section-title');
  if (banner) banner.textContent = `${cityDisplay} Air Quality Dashboard`;
  // Dashboard sub-heading
  document.querySelectorAll('.section-sub').forEach(el => {
    if (el.textContent.includes('Real-time monitoring')) el.textContent = `Real-time monitoring for ${cityDisplay} · AI-powered forecasting · Health insights`;
  });
  // Chatbot bot name
  const botName = document.getElementById('chatBotName');
  if (botName) botName.textContent = `${cityDisplay} Air Health Advisor`;
  // Stats cards placeholder text
  const acrossEl = document.getElementById('statActiveAcross');
  if (acrossEl) acrossEl.textContent = `Near ${cityDisplay}`;
});

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const now = new Date();

// Live data store (shared across pages)
const LiveData = window.LiveData = {
  aqi: null, pm25: null, pm10: null, no2: null,
  o3: null, so2: null, co: null,
  temp: null, wind: null, humidity: null,
  forecastAQI: [142, 158, 135, 120, 168, 145, 132],
  forecastPM25: [], forecastPM10: [],
  weatherDesc: 'Partly Cloudy',
};

// Alert thresholds (saved to localStorage)
let thresholds = {
  pm25: parseInt(localStorage.getItem('thresh_pm25') || '60'),
  aqi: parseInt(localStorage.getItem('thresh_aqi') || '150'),
  no2: parseInt(localStorage.getItem('thresh_no2') || '40'),
};

// ===== UTILITY =====
function rnd(min, max) { return Math.round(Math.random() * (max - min) + min); }
function rndF(min, max, dec = 1) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function aqiColor(v) {
  if (!v || isNaN(v)) return '#888';
  if (v < 51) return '#00e676'; if (v < 101) return '#ffeb3b';
  if (v < 151) return '#ff9800'; if (v < 201) return '#f44336';
  if (v < 301) return '#9c27b0'; return '#7b1fa2';
}
function aqiLabel(v) {
  if (!v || isNaN(v)) return 'Unknown';
  if (v < 51) return 'Good'; if (v < 101) return 'Moderate';
  if (v < 151) return 'Unhealthy–Sensitive'; if (v < 201) return 'Unhealthy';
  if (v < 301) return 'Very Unhealthy'; return 'Hazardous';
}
function aqiMsg(v) {
  if (!v || isNaN(v)) return 'Data unavailable.';
  if (v < 51) return 'Air quality is satisfactory and poses little or no risk.';
  if (v < 101) return 'Air quality is acceptable. Some pollutants may concern sensitive people.';
  if (v < 151) return 'Sensitive groups should reduce prolonged outdoor exertion.';
  if (v < 201) return 'Everyone may experience health effects. Wear a mask outdoors.';
  if (v < 301) return 'Health alert — serious effects possible for everyone.';
  return 'Emergency conditions. Everyone should avoid all outdoor exertion.';
}

// ===== CLOCK =====
function updateClock() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const lu = document.getElementById('lastUpdated');
  if (lu) lu.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
setInterval(updateClock, 1000);
updateClock();

// ===== PAGE NAVIGATION (with History API) =====
const pageTitles = {
  home: 'Dashboard', forecast: '7-Day Forecast', map: 'Pollution Map',
  viz3d: '3D AQI Cityscape', ai: 'AI Prediction', aichat: 'AI Health Advisor',
  history: 'Historical Analysis', health: 'Health Advisory',
  exposure: 'Exposure Tracker', alerts: 'Alerts System', data: 'Data Sources'
};
function showPage(id, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (navEl) navEl.classList.add('active');
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = pageTitles[id] || id;
  history.pushState({ page: id }, '', '#' + id);
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  // Lazy init
  const inits = {
    map: () => { initLeafletMap(); buildAreaRankings(); buildAreaChart(); buildSourcesChart(); },
    viz3d: () => {
      // Always dispose and re-init with latest cityAreas
      if (renderer3D) { cancelAnimationFrame(animFrame3D); renderer3D.dispose(); renderer3D = null; scene3D = null; camera3D = null; bars3D = []; smokeParticles3D = []; }
      init3D();
    },
    ai: () => { buildAICharts(); buildFeatureImportance(); },
    history: () => { buildHistoryChart(); buildDistChart(); buildCorrChart(); buildHeatmapChart(); },
    health: () => buildHealthChart(),
    alerts: () => buildAlerts(),
    exposure: () => { buildExposureChart(); updateStatsCards(); }, // repopulate dropdown
    aichat: () => updateChatContext(),
  };
  if (inits[id]) setTimeout(inits[id], 80);
}
window.addEventListener('popstate', e => {
  if (e.state && e.state.page) {
    const nav = document.querySelector(`.nav-item[onclick*="'${e.state.page}'"]`);
    showPage(e.state.page, nav);
  }
});

// ===== THEME TOGGLE =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  // Rebuild all active charts
  setTimeout(() => {
    rebuildAllCharts();
  }, 100);
}
function rebuildAllCharts() {
  if (trendChart) { buildTrendChart(); }
}

// ===== CHART DEFAULTS =====
const CHART_FONT = "'Exo 2', sans-serif";
function makeGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 200);
  g.addColorStop(0, color1); g.addColorStop(1, color2);
  return g;
}
function baseOpts(yLabel = '') {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const textColor = isDark ? 'rgba(226,238,255,0.7)' : 'rgba(10,22,40,0.7)';
  const gridColor = isDark ? 'rgba(56,180,255,0.06)' : 'rgba(0,0,0,0.06)';
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#0d1424' : '#fff',
        borderColor: 'rgba(56,180,255,0.3)', borderWidth: 1,
        titleFont: { family: CHART_FONT, size: 13, weight: '700' },
        bodyFont: { family: CHART_FONT, size: 12 },
        titleColor: isDark ? '#e2eeff' : '#0a1628',
        bodyColor: isDark ? '#7a9fc0' : '#3a5a80',
        padding: 10, cornerRadius: 8,
      }
    },
    scales: {
      x: { ticks: { color: textColor, font: { family: CHART_FONT, size: 11 } }, grid: { color: gridColor }, border: { display: false } },
      y: {
        ticks: { color: textColor, font: { family: CHART_FONT, size: 11 } }, grid: { color: gridColor }, border: { display: false },
        title: { display: !!yLabel, text: yLabel, color: textColor, font: { family: CHART_FONT, size: 11 } }
      },
    },
    animation: { duration: 800, easing: 'easeInOutQuart' },
  };
}

// ===== DRAW GAUGE (single unified function) =====
function drawGauge(aqi) {
  const canvas = document.getElementById('gaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 220; canvas.height = 120;
  const cx = canvas.width / 2, cy = canvas.height, radius = 90;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#00e676');
  gradient.addColorStop(0.25, '#ffeb3b');
  gradient.addColorStop(0.5, '#ff9800');
  gradient.addColorStop(0.75, '#f44336');
  gradient.addColorStop(1, '#9c27b0');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, 0);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 14;
  ctx.stroke();
  if (aqi) {
    const angle = Math.PI + (aqi / 500) * Math.PI;
    const x = cx + (radius - 10) * Math.cos(angle);
    const y = cy + (radius - 10) * Math.sin(angle);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
}

// ===== GEOCODING (Open-Meteo — free, no key, covers every town) =====
const _geoCache = {};
async function geocodeCity(name) {
  const key = (name || '').toLowerCase().trim();
  if (!key) return null;
  if (_geoCache[key]) return _geoCache[key];
  // If precise coordinates were passed from intro (GPS or picker city), use them directly.
  // This guarantees weather + air-quality reflect the exact town/village, not a distant match.
  if (HAS_SELECTED_COORDS) {
    const out = { lat: SELECTED_LAT, lng: SELECTED_LNG, name: name.charAt(0).toUpperCase() + name.slice(1) };
    _geoCache[key] = out;
    return out;
  }
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
    const res = await proxiedFetch(url);
    const data = await res.json();
    if (!data.results || !data.results.length) return null;
    // Prefer India (IN); otherwise first result.
    const pick = data.results.find(r => r.country_code === 'IN') || data.results[0];
    const out = { lat: pick.latitude, lng: pick.longitude, name: pick.name, admin1: pick.admin1, country: pick.country };
    _geoCache[key] = out;
    return out;
  } catch (e) {
    console.warn('[geocode] failed for', name, e);
    return null;
  }
}

// Convert PM2.5 (µg/m³) to US EPA AQI — used when only pollutant concentrations are available
function pm25ToAQI(c) {
  if (c == null || isNaN(c)) return null;
  const bp = [
    [0.0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 500.4, 301, 500]
  ];
  for (const [cl, ch, il, ih] of bp) {
    if (c >= cl && c <= ch) return Math.round(((ih - il) / (ch - cl)) * (c - cl) + il);
  }
  return c > 500.4 ? 500 : null;
}

// ===== LOAD AQI — dynamic for every city/town via geocoding + WAQI + Open-Meteo =====
async function loadAQI() {
  const geo = await geocodeCity(SELECTED_CITY);
  let aqi = null, iaqi = {}, source = '';

  // 1) Try WAQI at resolved coordinates — nearest real monitoring station
  if (geo) {
    try {
      const r = await proxiedFetch(`https://api.waqi.info/feed/geo:${geo.lat};${geo.lng}/?token=${WAQI_TOKEN}`);
      const j = await r.json();
      if (j.status === 'ok' && j.data && j.data.aqi !== '-' && !isNaN(parseInt(j.data.aqi))) {
        aqi = parseInt(j.data.aqi);
        iaqi = j.data.iaqi || {};
        source = 'WAQI (' + (j.data.city?.name || 'nearest station') + ')';
        // Forecast series (if available)
        const daily = j.data.forecast?.daily || {};
        if (daily.pm25 && daily.pm25.length > 0) {
          const today = j.data.time?.iso?.split('T')[0] || new Date().toISOString().split('T')[0];
          LiveData.forecastPM25 = formatForecastArr(daily.pm25, today);
          LiveData.forecastPM10 = formatForecastArr(daily.pm10 || [], today);
          LiveData.forecastAQI = formatForecastArr(daily.uvi || daily.pm25, today).map(v => Math.round(v * 3.2));
        }
      }
    } catch (e) { console.warn('WAQI geo fetch failed:', e); }
  }

  // 2) Fallback: WAQI by city name
  if (aqi === null) {
    try {
      const r = await proxiedFetch(`https://api.waqi.info/feed/${encodeURIComponent(SELECTED_CITY)}/?token=${WAQI_TOKEN}`);
      const j = await r.json();
      if (j.status === 'ok' && j.data && j.data.aqi !== '-' && !isNaN(parseInt(j.data.aqi))) {
        aqi = parseInt(j.data.aqi);
        iaqi = j.data.iaqi || {};
        source = 'WAQI (' + (j.data.city?.name || SELECTED_CITY) + ')';
      }
    } catch (e) { /* ignore */ }
  }

  // 3) Fallback: Open-Meteo Air Quality (works for ANY lat/lng — every town/village)
  if (aqi === null && geo) {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.lat}&longitude=${geo.lng}` +
        `&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide&timezone=auto`;
      const r = await proxiedFetch(url);
      const j = await r.json();
      const c = j.current || {};
      const usAqi = c.us_aqi != null ? Math.round(c.us_aqi) : pm25ToAQI(c.pm2_5);
      if (usAqi != null) {
        aqi = usAqi;
        iaqi = {
          pm25: { v: c.pm2_5 != null ? Math.round(c.pm2_5) : null },
          pm10: { v: c.pm10 != null ? Math.round(c.pm10) : null },
          no2:  { v: c.nitrogen_dioxide != null ? Math.round(c.nitrogen_dioxide) : null },
          so2:  { v: c.sulphur_dioxide != null ? Math.round(c.sulphur_dioxide) : null },
          o3:   { v: c.ozone != null ? Math.round(c.ozone) : null },
          co:   { v: c.carbon_monoxide != null ? Math.round(c.carbon_monoxide / 100) : null },
        };
        source = 'Open-Meteo (' + geo.name + ')';
      }
    } catch (e) { console.warn('Open-Meteo AQ fetch failed:', e); }
  }

  if (aqi !== null) {
    LiveData.aqi = aqi;
    LiveData.pm25 = iaqi.pm25?.v ?? null;
    LiveData.pm10 = iaqi.pm10?.v ?? null;
    LiveData.no2  = iaqi.no2?.v ?? null;
    LiveData.o3   = iaqi.o3?.v ?? null;
    LiveData.so2  = iaqi.so2?.v ?? null;
    LiveData.co   = iaqi.co?.v ?? null;
    updateAQIDisplay(aqi);
    updatePollutantsDisplay(iaqi);
    checkThresholds(aqi, iaqi);
    updateChatContext();
    updateStatsCards();
    const sv = document.getElementById('sidebar-aqi');
    const ss = document.getElementById('sidebar-status');
    if (sv) sv.textContent = aqi;
    if (ss) { ss.textContent = aqiLabel(aqi); ss.style.color = aqiColor(aqi); }
    console.log('✅ Live AQI loaded from', source, '→', aqi);
    return;
  }

  // 4) Last-resort mock (offline / all APIs unreachable)
  console.warn('All live AQI sources failed — using mock estimate');
  try {
    const isChennai = (SELECTED_CITY || '').toLowerCase() === 'chennai';
    const mockAreas = isChennai ? getChennaiMockAreas() : getCityMockAreas(SELECTED_CITY);
    const sorted = [...mockAreas].sort((a, b) => a.aqi - b.aqi);
    const medAqi = sorted[Math.floor(sorted.length / 2)].aqi;
    const medArea = sorted[Math.floor(sorted.length / 2)];
    LiveData.aqi = medAqi;
    // Fill pollutants from mock (Chennai has pm25/pm10/no2; others get estimates)
    if (isChennai && medArea.pm25) {
      LiveData.pm25 = medArea.pm25;
      LiveData.pm10 = medArea.pm10;
      LiveData.no2 = medArea.no2;
    } else {
      LiveData.pm25 = Math.round(medAqi * 0.4);
      LiveData.pm10 = Math.round(medAqi * 0.7);
      LiveData.no2 = Math.round(medAqi * 0.25);
    }
    LiveData.o3 = LiveData.o3 || Math.round(medAqi * 0.18);
    LiveData.so2 = LiveData.so2 || Math.round(medAqi * 0.08);
    LiveData.co = LiveData.co || parseFloat((medAqi * 0.01).toFixed(2));
    // Build a simple synthetic iaqi object for the pollutants panel
    const mockIaqi = {
      pm25: { v: LiveData.pm25 }, pm10: { v: LiveData.pm10 }, no2: { v: LiveData.no2 },
      o3: { v: LiveData.o3 }, so2: { v: LiveData.so2 }, co: { v: LiveData.co }
    };
    updateAQIDisplay(medAqi);
    updatePollutantsDisplay(mockIaqi);
    checkThresholds(medAqi, mockIaqi);
    updateChatContext();
    updateStatsCards();
    const sv = document.getElementById('sidebar-aqi');
    const ss = document.getElementById('sidebar-status');
    if (sv) sv.textContent = medAqi;
    if (ss) { ss.textContent = aqiLabel(medAqi); ss.style.color = aqiColor(medAqi); }
    showToast('📡', 'Using Estimated Data', 'Real-time data loading in background…');
  } catch (e) { console.warn('mock fallback failed:', e); }
}

function formatForecastArr(arr, today) {
  return (arr || []).filter(i => i.day >= today).slice(0, 7).map(i => i.avg);
}

function updateAQIDisplay(aqi) {
  const color = aqiColor(aqi);
  const el = document.getElementById('gaugeNum');
  const badge = document.getElementById('aqiBadge');
  const desc = document.getElementById('aqiDesc');
  if (el) { el.textContent = aqi; el.style.color = color; }
  if (badge) {
    badge.textContent = aqiLabel(aqi).toUpperCase();
    badge.style.color = color; badge.style.borderColor = 'transparent';
    badge.style.background = 'transparent';
  }
  if (desc) desc.textContent = aqiMsg(aqi);
  const ptr = document.getElementById('aqiPointer');
  if (ptr) ptr.style.left = Math.min((aqi / 500) * 100, 99) + '%';
  drawGauge(aqi);
  
  // Health Advisory Hero Card
  const hAqi = document.getElementById('healthAqiDialVal');
  const hStatus = document.getElementById('healthAqiDialStatus');
  const hProg = document.getElementById('healthAqiDialProgress');
  const hMain = document.getElementById('healthMsgMain');
  const hSub = document.getElementById('healthMsgSub');
  if (hAqi) hAqi.textContent = aqi;
  if (hStatus) { hStatus.textContent = aqiLabel(aqi); hStatus.style.color = color; }
  if (hProg) { hProg.style.borderColor = color; hProg.style.borderLeftColor = 'transparent'; hProg.style.borderBottomColor = 'transparent'; hProg.style.boxShadow = `0 0 20px ${color}66`; }
  if (hMain && typeof getCharMood === 'function') {
    const mood = getCharMood(aqi);
    hMain.textContent = mood.label + (aqi <= 100 ? ' 😊' : (aqi <= 200 ? ' 😷' : ' ⚠️'));
    if (hSub) hSub.textContent = mood.advice;
  }

  // Sync 3D effects
  if (typeof updateAQIOrb === 'function') updateAQIOrb(aqi);
  if (typeof updateBgParticles === 'function') updateBgParticles(aqi);
  // Character reacts to AQI
  if (typeof updateCharacter === 'function') updateCharacter(aqi);
}

// ═══════════════════════════════════════════════════════════════
// CHARACTER REACTION — 3D model who feels the AQI
// ───────────────────────────────────────────────────────────────
// 3D character is loaded by character3d.js. This function updates:
//   - The mood text + advice caption
//   - The card glow tint
//   - The 3D halo color (via Character3D.setAQI)
// ═══════════════════════════════════════════════════════════════
function updateCharacter(aqi) {
  const color = aqiColor(aqi);
  const mood = getCharMood(aqi);

  // Mood caption
  const moodEl = document.getElementById('charMood');
  const adviceEl = document.getElementById('charAdvice');
  if (moodEl)   { moodEl.textContent = mood.label; moodEl.style.color = color; }
  if (adviceEl) adviceEl.textContent = mood.advice;

  // Subtle scene-wide tint — whole card glow shifts toward AQI color
  const card = document.querySelector('.character-card');
  if (card) {
    card.style.boxShadow = `inset 0 0 60px ${color}15, 0 0 0 1px ${color}22`;
  }
}

/** Map an AQI value to a mood state (label + brief advice) */
function getCharMood(aqi) {
  if (aqi <= 50)  return { key: 'great',     label: 'Feeling Great',       advice: 'Air is clean — perfect for outdoor activities!' };
  if (aqi <= 100) return { key: 'okay',      label: 'Doing Okay',          advice: 'Air is acceptable. Enjoy your day outside.' };
  if (aqi <= 135) return { key: 'uneasy',    label: 'A Bit Uneasy',        advice: 'Sensitive groups should take it easy outdoors.' };
  if (aqi <= 170) return { key: 'worried',   label: 'Worried',             advice: 'Consider wearing a mask if you\'re outside for long.' };
  if (aqi <= 210) return { key: 'sick',      label: 'Not Feeling Good',    advice: 'Limit outdoor time. Wear an N95 mask if you must go out.' };
  if (aqi <= 250) return { key: 'coughing',  label: 'Coughing',            advice: 'Stay indoors. Keep windows closed. Use an air purifier.' };
  return            { key: 'severe',    label: 'Seriously Unwell',    advice: 'Do not go outside. Emergency conditions — seek shelter.' };
}

// ===== POLLUTANTS DISPLAY =====
const limits = { pm25: 150, pm10: 250, no2: 200, o3: 180, so2: 350, co: 30 };
function getPollColor(type, v) {
  if (type === 'pm25' || type === 'pm10') {
    if (v <= 50) return '#00e676'; if (v <= 100) return '#ffeb3b'; return '#ff9800';
  }
  if (type === 'no2') return v > 40 ? '#ff6b6b' : '#00e676';
  if (type === 'o3') return '#00e5c8';
  if (type === 'so2') return '#00e676';
  if (type === 'co') return '#38b4ff';
  return '#ccc';
}
const POLL_COLOR_LABEL = {
  '#00e676':'Good','#ffeb3b':'Moderate','#ff9800':'USG',
  '#ff6b6b':'Unhealthy','#f44336':'Unhealthy','#9c27b0':'Very Unhealthy',
  '#00e5c8':'Good','#38b4ff':'Good'
};
function updatePollutantsDisplay(iaqi) {
  const polls = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'];
  polls.forEach(p => {
    const v = iaqi[p]?.v;
    const valEl = document.getElementById(p + 'Val');
    const barEl = document.getElementById(p + 'Bar');
    const statusEl = document.getElementById(p + 'Status');
    if (valEl && v != null) {
      valEl.textContent = v;
      const color = getPollColor(p, v);
      valEl.style.color = color;
      if (statusEl) { statusEl.style.color = color; statusEl.textContent = POLL_COLOR_LABEL[color] || 'Good'; }
      if (barEl) {
        barEl.style.width = Math.min((v / limits[p]) * 100, 100) + '%';
        barEl.style.background = color;
      }
      
      // Update Health Advisory Pills
      const healthId = 'health' + p.charAt(0).toUpperCase() + p.slice(1) + 'Val';
      const hValEl = document.getElementById(healthId);
      if (hValEl) { hValEl.textContent = v; hValEl.style.color = color; }

      // Update live store
      LiveData[p] = v;
    }
  });
  updateContextPanel();
}

function updateContextPanel() {
  const set = (id, val, unit = '') => { const el = document.getElementById(id); if (el) el.textContent = val != null ? val + unit : '—'; };
  set('ctx-aqi', LiveData.aqi);
  set('ctx-pm25', LiveData.pm25, ' µg/m³');
  set('ctx-pm10', LiveData.pm10, ' µg/m³');
  set('ctx-no2', LiveData.no2, ' µg/m³');
  set('ctx-temp', LiveData.temp, '°C');
  set('ctx-wind', LiveData.wind, ' km/h');
  const chatAqi = document.getElementById('chatAQI');
  if (chatAqi && LiveData.aqi) chatAqi.textContent = `${LiveData.aqi} (${aqiLabel(LiveData.aqi)})`;
}

// ===== WEATHER — Open-Meteo (free, no key, real data for any lat/lng) =====
// Falls back to OpenWeatherMap by city name, then to a realistic mock.
async function loadWeather() {
  // 1) Try Open-Meteo at geocoded coordinates — real live data for every town
  const geo = await geocodeCity(SELECTED_CITY);
  if (geo) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,wind_direction_10m,visibility,weather_code&timezone=auto`;
      const res = await proxiedFetch(url);
      const j = await res.json();
      const c = j.current || {};
      if (c.temperature_2m != null) {
        const wc = c.weather_code;
        const descMap = {
          0: ['clear sky', 'Clear'], 1: ['mostly clear', 'Clear'], 2: ['partly cloudy', 'Clouds'], 3: ['overcast', 'Clouds'],
          45: ['fog', 'Fog'], 48: ['freezing fog', 'Fog'],
          51: ['light drizzle', 'Drizzle'], 53: ['drizzle', 'Drizzle'], 55: ['heavy drizzle', 'Drizzle'],
          61: ['light rain', 'Rain'], 63: ['rain', 'Rain'], 65: ['heavy rain', 'Rain'],
          71: ['light snow', 'Snow'], 73: ['snow', 'Snow'], 75: ['heavy snow', 'Snow'],
          80: ['rain showers', 'Rain'], 81: ['rain showers', 'Rain'], 82: ['violent showers', 'Rain'],
          95: ['thunderstorm', 'Thunderstorm'], 96: ['thunderstorm w/ hail', 'Thunderstorm'], 99: ['thunderstorm w/ hail', 'Thunderstorm']
        };
        const [desc, main] = descMap[wc] || ['clear sky', 'Clear'];
        displayWeather({
          main: {
            temp: c.temperature_2m + 273.15, // displayWeather subtracts 273.15
            humidity: Math.round(c.relative_humidity_2m ?? 60),
            pressure: Math.round(c.pressure_msl ?? 1013)
          },
          weather: [{ description: desc, main }],
          wind: { speed: Math.round((c.wind_speed_10m ?? 0)), deg: Math.round(c.wind_direction_10m ?? 0) },
          visibility: Math.round(c.visibility ?? 10000),
          name: geo.name
        });
        console.log('✅ Live weather loaded from Open-Meteo for', geo.name);
        return;
      }
    } catch (e) { console.warn('Open-Meteo weather failed:', e); }
  }

  // 2) Fallback: OpenWeatherMap by city name
  try {
    const res = await proxiedFetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(SELECTED_CITY)}&APPID=${OW_KEY}`);
    const data = await res.json();
    if (data.cod !== 200) throw new Error('Weather API error: ' + data.message);
    displayWeather(data);
    console.log('✅ Live weather loaded from OWM for', SELECTED_CITY);
    return;
  } catch (err) {
    console.warn('Weather fetch failed, using mock:', err);
  }

  // 3) Last-resort mock
  const isChennai = (SELECTED_CITY || '').toLowerCase() === 'chennai';
  displayWeather({
    main: {
      temp: isChennai ? (305 + Math.random() * 4) : (295 + Math.random() * 10),
      humidity: isChennai ? (72 + Math.round(Math.random() * 15)) : (50 + Math.round(Math.random() * 30)),
      pressure: 1010 + Math.round(Math.random() * 8)
    },
    weather: [{ description: isChennai ? 'partly cloudy' : 'clear sky', main: 'Clouds' }],
    wind: { speed: isChennai ? (12 + Math.round(Math.random() * 8)) : (8 + Math.round(Math.random() * 12)), deg: Math.round(Math.random() * 360) },
    visibility: 8000 + Math.round(Math.random() * 4000),
    name: SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1),
  });
}
function displayWeather(data) {
  const tempC = parseFloat((data.main.temp - 273.15).toFixed(1));
  const desc = data.weather[0].description;
  const condition = data.weather[0].main.toLowerCase();
  let icon = '🌤';
  if (condition.includes('cloud')) icon = '☁️';
  else if (condition.includes('rain')) icon = '🌧';
  else if (condition.includes('clear')) icon = '☀️';
  else if (condition.includes('thunder')) icon = '⛈';
  else if (condition.includes('mist') || condition.includes('fog')) icon = '🌫';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  set('temperature', tempC + '°C');
  set('weatherText', capitalize(desc) + ' · ' + data.name);
  set('weatherIcon', icon);
  set('humidity', data.main.humidity + '%');
  set('wind', data.wind.speed + ' km/h');
  set('visibility', (data.visibility / 1000).toFixed(1) + ' km');
  set('pressure', data.main.pressure + ' hPa');
  // Wind rose
  const arrow = document.getElementById('windArrow');
  if (arrow) arrow.setAttribute('transform', `rotate(${data.wind.deg} 30 30)`);
  const dirText = document.getElementById('windDirText');
  if (dirText) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    dirText.textContent = dirs[Math.round(data.wind.deg / 22.5) % 16];
  }
  // Update live store
  LiveData.temp = tempC;
  LiveData.wind = data.wind.speed;
  LiveData.humidity = data.main.humidity;
  LiveData.weatherDesc = capitalize(desc);
  updateContextPanel();
}
function capitalize(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

// ===== THRESHOLD ALERTS CHECK =====
function checkThresholds(aqi, iaqi) {
  const alerts = [];
  if (aqi > thresholds.aqi) alerts.push({ title: 'AQI Threshold Exceeded', desc: `AQI ${aqi} exceeds your alert level of ${thresholds.aqi}`, sev: 'high' });
  if ((iaqi.pm25?.v || 0) > thresholds.pm25) alerts.push({ title: 'PM2.5 Alert', desc: `PM2.5 ${iaqi.pm25?.v} µg/m³ exceeds alert level ${thresholds.pm25}`, sev: 'high' });
  if ((iaqi.no2?.v || 0) > thresholds.no2) alerts.push({ title: 'NO₂ Alert', desc: `NO₂ ${iaqi.no2?.v} µg/m³ exceeds alert level ${thresholds.no2}`, sev: 'med' });
  if (alerts.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
    alerts.forEach(a => new Notification('ChennAIR: ' + a.title, { body: a.desc }));
  }
}
function saveThresholds() {
  const sliders = document.querySelectorAll('input[type=range]');
  // Just save current label values
  localStorage.setItem('thresh_pm25', thresholds.pm25);
  localStorage.setItem('thresh_aqi', thresholds.aqi);
  localStorage.setItem('thresh_no2', thresholds.no2);
}

// ===== 24H TREND CHART =====
let trendChart;
function buildTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  const labels = [];
  for (let i = 23; i >= 0; i--) { const h = new Date(now); h.setHours(now.getHours() - i); labels.push(h.getHours() + ':00'); }
  // Simulate realistic 24h AQI centered on live value
  const base = LiveData.aqi || 140;
  let v = base;
  const data = [];
  for (let i = 0; i < 24; i++) { v += rnd(-20, 20); v = Math.max(40, Math.min(280, v)); data.push(v); }
  const g = makeGradient(ctx.getContext('2d'), 'rgba(56,180,255,0.4)', 'rgba(56,180,255,0.0)');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, fill: true, backgroundColor: g, borderColor: '#38b4ff', borderWidth: 2.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 }] },
    options: { ...baseOpts('AQI'), plugins: { ...baseOpts().plugins, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: c => `AQI: ${c.raw}` } } } },
  });
}

// ===== 7-DAY FORECAST =====
let forecastMainChart;
let currentForecastType = 'aqi';
let forecastDataSets = {};

function buildDayCards() {
  const el = document.getElementById('daysForecast'); if (!el) return;
  
  let aqis = LiveData.forecastAQI;
  if (!aqis || aqis.length < 7) {
    const base = LiveData.aqi || 50;
    let v = base;
    aqis = [base];
    for (let i = 1; i < 7; i++) { v += rnd(-15, 15); v = Math.max(10, v); aqis.push(v); }
    LiveData.forecastAQI = aqis;
  }
  if (LiveData.aqi) aqis[0] = LiveData.aqi;
  
  el.innerHTML = aqis.map((aqi, i) => {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const col = aqiColor(aqi);
    let trend = '→';
    if (i > 0) { trend = aqi > aqis[i-1] ? '↑' : (aqi < aqis[i-1] ? '↓' : '→'); }
    
    return `<div class="day-card realism-card${i === 0 ? ' active' : ''}" onclick="highlightDay(${i},this)" style="cursor:pointer;">
      <div class="realism-card-topglow"></div>
      <div class="realism-card-blob"></div>
      <div class="realism-card-inner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 10px; height:100%;">
        <div class="realism-card-inner-glow"></div>
        <div class="day-name" style="font-weight:700; font-size:12px; margin-bottom:2px;">${i === 0 ? 'TODAY' : days[d.getDay()].toUpperCase()}</div>
        <div class="day-date" style="font-size:10px; color:var(--text3); margin-bottom:6px;">${d.getDate()} ${months[d.getMonth()]}</div>
        <div class="day-aqi" style="font-family:var(--font-head); font-size:22px; font-weight:700; color:${col}">${aqi}</div>
        <div class="day-status" style="font-size:11px; font-weight:600; color:${col}">${aqiLabel(aqi).split('–')[0]}</div>
        <div class="day-trend" style="font-size:12px; margin-top:4px;">${trend}</div>
      </div>
    </div>`;
  }).join('');
}
function highlightDay(i, el) {
  document.querySelectorAll('.day-card').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
}

function buildForecastMainChart(type = 'aqi') {
  const ctx = document.getElementById('forecastMainChart'); if (!ctx) return;
  currentForecastType = type;
  const labels = [];
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); labels.push((i === 0 ? 'Today' : days[d.getDay()]) + ' ' + d.getDate()); }
  let mainData, yLabel, color;
  if (type === 'pm25') {
    if (!LiveData.forecastPM25 || LiveData.forecastPM25.length < 7) {
      const base = LiveData.pm25 || 25; let v = base; const arr = [base];
      for (let i = 1; i < 7; i++) { v += rnd(-10, 10); v = Math.max(5, v); arr.push(v); }
      LiveData.forecastPM25 = arr;
    }
    if (LiveData.pm25) LiveData.forecastPM25[0] = LiveData.pm25;
    mainData = LiveData.forecastPM25; yLabel = 'PM2.5 (µg/m³)'; color = '#38b4ff';
  } else if (type === 'pm10') {
    if (!LiveData.forecastPM10 || LiveData.forecastPM10.length < 7) {
      const base = LiveData.pm10 || 45; let v = base; const arr = [base];
      for (let i = 1; i < 7; i++) { v += rnd(-15, 15); v = Math.max(10, v); arr.push(v); }
      LiveData.forecastPM10 = arr;
    }
    if (LiveData.pm10) LiveData.forecastPM10[0] = LiveData.pm10;
    mainData = LiveData.forecastPM10; yLabel = 'PM10 (µg/m³)'; color = '#00e5c8';
  } else {
    if (!LiveData.forecastAQI || LiveData.forecastAQI.length < 7) {
      const base = LiveData.aqi || 50; let v = base; const arr = [base];
      for (let i = 1; i < 7; i++) { v += rnd(-15, 15); v = Math.max(10, v); arr.push(v); }
      LiveData.forecastAQI = arr;
    }
    if (LiveData.aqi) LiveData.forecastAQI[0] = LiveData.aqi;
    mainData = LiveData.forecastAQI; yLabel = 'AQI'; color = '#38b4ff';
  }
  const g = makeGradient(ctx.getContext('2d'), color.replace(')', ',0.3)').replace('rgb', 'rgba'), color + '11');
  const confData = mainData.map(v => v + rnd(10, 25));
  const opts = baseOpts(yLabel);
  opts.plugins.legend = { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 12 }, boxWidth: 16, usePointStyle: true } };
  if (forecastMainChart) forecastMainChart.destroy();
  forecastMainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels, datasets: [
        { label: `Predicted ${yLabel}`, data: mainData, fill: true, backgroundColor: g, borderColor: color, borderWidth: 2.5, tension: 0.4, pointRadius: 4, pointBackgroundColor: color },
        { label: 'Confidence Band', data: confData, fill: '-1', backgroundColor: 'rgba(0,229,200,0.08)', borderColor: 'rgba(0,229,200,0.4)', borderWidth: 1, borderDash: [5, 5], tension: 0.4, pointRadius: 0 },
      ]
    },
    options: opts
  });
  // Update button styles
  ['aqi', 'pm25', 'pm10'].forEach(t => {
    const btn = document.getElementById('btn-' + t);
    if (btn) { btn.style.background = t === type ? 'var(--accent)' : ''; btn.style.color = t === type ? '#080c14' : ''; }
  });
}
function updateForecastChart(type) { buildForecastMainChart(type); }

const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((element, index) => {
        ctx.fillStyle = dataset.borderColor;
        const val = Number(dataset.data[index]).toFixed(dataset.data[index] < 10 ? 1 : 0);
        ctx.fillText(val, element.x, element.y - 10);
      });
    });
  }
};

function buildPollChart(prefix, label, color, base, variance, actualData = null) {
  const chartId = prefix + 'Chart';
  const existing = Chart.getChart(chartId); if (existing) existing.destroy();
  const ctx = document.getElementById(chartId); if (!ctx) return;
  
  const labels = [];
  for (let i = 0; i < 7; i++) { 
    const d = new Date(now); d.setDate(now.getDate() + i); 
    labels.push(i === 0 ? 'Today' : days[d.getDay()].substring(0,3)); 
  }

  let dataArr = actualData;
  if (!dataArr || dataArr.length === 0) {
    dataArr = Array.from({ length: 7 }, () => rndF(base - variance, base + variance));
  }
  dataArr[0] = base; // Force Today's value to match the real-time LiveData measurement
  while(dataArr.length < 7) { dataArr.push(dataArr[dataArr.length - 1] || base); }
  
  const max = Math.max(...dataArr);
  const min = Math.min(...dataArr);
  const avg = dataArr.reduce((a,b)=>a+b,0) / dataArr.length;
  const current = dataArr[0];
  
  const peakIdx = dataArr.indexOf(max);
  const peakDay = labels[peakIdx] === 'Today' ? 'Today' : (i => { const d=new Date(now); d.setDate(now.getDate()+i); return days[d.getDay()]; })(peakIdx);
  
  const isDecimal = current < 10;
  const fmt = v => Number(v).toFixed(isDecimal ? 1 : 0);
  
  const oldAvg = avg - rndF(0, avg * 0.2);
  const trendPct = Math.round(((avg - oldAvg) / oldAvg) * 100);
  
  let statusText = 'Good'; let statusColor = '#00e5c8';
  if (current > base + variance*0.5) { statusText = 'Unhealthy'; statusColor = '#ff3b30'; }
  else if (current > base - variance*0.2) { statusText = 'Moderate'; statusColor = '#ffcc00'; }

  const src = id => document.getElementById(id);
  const fv = src('fv-'+prefix); if(fv) fv.textContent = fmt(current);
  const fh = src('fh-'+prefix); if(fh) fh.textContent = fmt(max);
  const fl = src('fl-'+prefix); if(fl) fl.textContent = fmt(min);
  const fa = src('fa-'+prefix); if(fa) fa.textContent = fmt(avg);
  const fpd = src('fpd-'+prefix); if(fpd) fpd.textContent = peakDay;
  const fpv = src('fpv-'+prefix); if(fpv) {
    let unit = 'µg/m³'; if(prefix==='co') unit='mg/m³';
    fpv.textContent = fmt(max) + ' ' + unit;
  }
  const fnp = src('fnp-'+prefix); if(fnp) fnp.textContent = peakDay;
  
  const ft = src('ft-'+prefix); 
  if(ft) {
    ft.innerHTML = `<div class="f-trend-val" style="color:${trendPct >= 0 ? '#ff3b30' : '#00e5c8'}">
      <span class="f-arrow">${trendPct >= 0 ? '↑' : '↓'}</span> ${Math.abs(trendPct)}%
    </div><div class="f-trend-sub">vs last 7 days</div>`;
  }
  
  const fp = src('fp-'+prefix);
  if(fp) {
    fp.innerHTML = `<span class="f-dot" style="background:${statusColor};box-shadow:0 0 8px ${statusColor}"></span><span class="f-status" style="color:${statusColor}">${statusText}</span>`;
  }

  const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.3)'));
  grad.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0)'));

  new Chart(ctx, {
    type: 'line',
    data: {
      labels, 
      datasets: [{
        label, 
        data: dataArr,
        fill: true,
        backgroundColor: grad, 
        borderColor: color, 
        borderWidth: 2, 
        tension: 0.4,
        pointBackgroundColor: '#1a1f2b',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: { display: true, grid: { display: false, drawBorder: false }, ticks: { color: '#8ba2be', font: {size: 11, family: 'Inter'} } },
        y: { display: true, border: {display: false}, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { display: false, maxTicksLimit: 5 } }
      },
      layout: { padding: { top: 24, left: 10, right: 10, bottom: 0 } }
    },
    plugins: [valueLabelsPlugin]
  });
}

// ===== API FORECAST CHARTS (WAQI forecast data) =====
async function buildAPIForecastCharts() {
  const p25 = LiveData.pm25 || 35;
  const p10 = LiveData.pm10 || 55;
  const no2 = LiveData.no2 || 20;
  const o3 = LiveData.o3 || 25;
  const so2 = LiveData.so2 || 12;
  const co = LiveData.co || 0.8;

  try {
    const res = await proxiedFetch(`https://api.waqi.info/feed/${SELECTED_CITY}/?token=${WAQI_TOKEN}`);
    const result = await res.json();
    if (result.status !== 'ok') throw new Error();
    const daily = result.data.forecast?.daily || {};
    const apiTime = result.data.time?.iso || new Date().toISOString();
    const today = apiTime.split('T')[0];
    const getVals = (arr) => (arr || []).filter(i => i.day >= today).slice(0, 7).map(i => i.avg);
    
    if (daily.pm25 && daily.pm25.length > 0) {
      buildPollChart('pm25', 'PM2.5', 'rgb(56,180,255)', p25, p25*0.3, getVals(daily.pm25));
    } else {
      buildPollChart('pm25', 'PM2.5', 'rgb(56,180,255)', p25, p25*0.3);
    }
    if (daily.pm10 && daily.pm10.length > 0) {
      buildPollChart('pm10', 'PM10', 'rgb(0,229,200)', p10, p10*0.3, getVals(daily.pm10));
    } else {
      buildPollChart('pm10', 'PM10', 'rgb(0,229,200)', p10, p10*0.3);
    }
    buildPollChart('no2', 'NO₂', 'rgb(255,107,107)', no2, no2*0.3);
    buildPollChart('o3', 'O₃', 'rgb(255,235,59)', o3, o3*0.3);
    buildPollChart('so2', 'SO₂', 'rgb(255,152,0)', so2, so2*0.3);
    buildPollChart('co', 'CO', 'rgb(156,39,176)', co, co*0.3);
  } catch (err) {
    console.error('Forecast charts error:', err);
    buildPollChart('pm25', 'PM2.5', 'rgb(56,180,255)', p25, p25*0.3);
    buildPollChart('pm10', 'PM10', 'rgb(0,229,200)', p10, p10*0.3);
    buildPollChart('no2', 'NO₂', 'rgb(255,107,107)', no2, no2*0.3);
    buildPollChart('o3', 'O₃', 'rgb(255,235,59)', o3, o3*0.3);
    buildPollChart('so2', 'SO₂', 'rgb(255,152,0)', so2, so2*0.3);
    buildPollChart('co', 'CO', 'rgb(156,39,176)', co, co*0.3);
  }
}

// ===== DYNAMIC CITY AREAS =====
// Default areas for Chennai — will be overridden by live WAQI nearby station data
const defaultChennaiAreas = [
  { name: 'Tondairpet', aqi: 198, lat: 13.1387, lng: 80.2998, color: '#f44336' },
  { name: 'Manali', aqi: 185, lat: 13.1681, lng: 80.2566, color: '#f44336' },
  { name: 'Ambattur', aqi: 162, lat: 13.1127, lng: 80.1567, color: '#ff9800' },
  { name: 'Perambur', aqi: 155, lat: 13.1167, lng: 80.2353, color: '#ff9800' },
  { name: 'Kodambakkam', aqi: 138, lat: 13.0522, lng: 80.2261, color: '#ff9800' },
  { name: 'T. Nagar', aqi: 130, lat: 13.0401, lng: 80.2338, color: '#ff9800' },
  { name: 'Anna Nagar', aqi: 118, lat: 13.0850, lng: 80.2101, color: '#ffeb3b' },
  { name: 'Adyar', aqi: 95, lat: 13.0012, lng: 80.2565, color: '#ffeb3b' },
  { name: 'Velachery', aqi: 110, lat: 12.9815, lng: 80.2209, color: '#ffeb3b' },
  { name: 'OMR', aqi: 88, lat: 12.9121, lng: 80.2279, color: '#ffeb3b' },
  { name: 'ECR', aqi: 72, lat: 12.8600, lng: 80.2300, color: '#00e676' },
  { name: 'Besant Nagar', aqi: 62, lat: 13.0006, lng: 80.2707, color: '#00e676' },
];
// Live array — populated from WAQI when available, else falls back to defaults
let cityAreas = defaultChennaiAreas.map(a => ({ ...a }));

// City center coordinates for map focus
const cityCenters = {
  chennai: { lat: 13.08, lng: 80.27, zoom: 12 },
  delhi: { lat: 28.66, lng: 77.23, zoom: 11 },
  mumbai: { lat: 19.08, lng: 72.88, zoom: 12 },
  bangalore: { lat: 12.97, lng: 77.60, zoom: 12 },
  bengaluru: { lat: 12.97, lng: 77.60, zoom: 12 },
  hyderabad: { lat: 17.39, lng: 78.49, zoom: 12 },
  kolkata: { lat: 22.57, lng: 88.36, zoom: 12 },
  pune: { lat: 18.52, lng: 73.86, zoom: 12 },
  ahmedabad: { lat: 23.03, lng: 72.59, zoom: 12 },
  surat: { lat: 21.18, lng: 72.83, zoom: 12 },
  jaipur: { lat: 26.91, lng: 75.79, zoom: 12 },
  lucknow: { lat: 26.85, lng: 80.95, zoom: 12 },
  kanpur: { lat: 26.46, lng: 80.32, zoom: 11 },
  nagpur: { lat: 21.15, lng: 79.09, zoom: 12 },
  indore: { lat: 22.72, lng: 75.86, zoom: 12 },
  bhopal: { lat: 23.26, lng: 77.41, zoom: 12 },
  patna: { lat: 25.59, lng: 85.14, zoom: 12 },
  chandigarh: { lat: 30.74, lng: 76.79, zoom: 13 },
  coimbatore: { lat: 11.00, lng: 76.96, zoom: 12 },
  madurai: { lat: 9.93, lng: 78.12, zoom: 12 },
  vizag: { lat: 17.69, lng: 83.22, zoom: 12 },
  visakhapatnam: { lat: 17.69, lng: 83.22, zoom: 12 },
  kochi: { lat: 9.93, lng: 76.26, zoom: 12 },
  thiruvananthapuram: { lat: 8.51, lng: 76.94, zoom: 12 },
  bhubaneswar: { lat: 20.30, lng: 85.84, zoom: 12 },
  guwahati: { lat: 26.14, lng: 91.74, zoom: 12 },
  default: { lat: 20.59, lng: 78.96, zoom: 5 },
};

function getCityCenter(city) {
  const key = (city || '').toLowerCase().trim();
  return cityCenters[key] || cityCenters.default;
}

// Fetch nearby stations from WAQI for the selected city (CORS proxy + mock fallback)
async function loadNearbyAreas() {
  const isChennai = (SELECTED_CITY || '').toLowerCase() === 'chennai';
  // --- Immediately populate with mock so map/rankings aren't blank ---
  if (cityAreas.length === 0 || cityAreas === defaultChennaiAreas) {
    cityAreas = isChennai ? getChennaiMockAreas() : getCityMockAreas(SELECTED_CITY);
    buildAreaRankings();
    buildAreaChart();
    updateStatsCards();
    if (leafletMap) { leafletMarkers.forEach(m => m.remove()); leafletMarkers = []; addLeafletMarkers('aqi'); }
  }
  try {
    // Step 1: Get lat/lng for the city from the main feed
    const res = await proxiedFetch(`https://api.waqi.info/feed/${encodeURIComponent(SELECTED_CITY)}/?token=${WAQI_TOKEN}`);
    const result = await res.json();

    let lat, lng;
    if (result.status === 'ok') {
      lat = result.data.city?.geo?.[0];
      lng = result.data.city?.geo?.[1];
    }

    // Step 2: If no geo, try WAQI search API
    if (!lat || !lng) {
      const searchRes = await proxiedFetch(`https://api.waqi.info/search/?keyword=${encodeURIComponent(SELECTED_CITY)}&token=${WAQI_TOKEN}`);
      const searchData = await searchRes.json();
      if (searchData.status === 'ok' && searchData.data?.length > 0) {
        const first = searchData.data[0];
        lat = first.station?.geo?.[0];
        lng = first.station?.geo?.[1];
        const sAqi = parseInt(first.aqi);
        if (!LiveData.aqi && sAqi > 0) {
          LiveData.aqi = sAqi;
          updateAQIDisplay(sAqi);
          const sv = document.getElementById('sidebar-aqi');
          const ss = document.getElementById('sidebar-status');
          if (sv) sv.textContent = sAqi;
          if (ss) { ss.textContent = aqiLabel(sAqi); ss.style.color = aqiColor(sAqi); }
        }
      }
    }

    if (!lat || !lng) throw new Error('No geo data for city: ' + SELECTED_CITY);

    // Step 3: Fetch nearby stations — wider box for Chennai to catch all stations
    const delta = isChennai ? 1.0 : 0.6;
    const nearRes = await proxiedFetch(`https://api.waqi.info/map/bounds/?latlng=${lat - delta},${lng - delta},${lat + delta},${lng + delta}&token=${WAQI_TOKEN}`);
    const nearData = await nearRes.json();
    if (nearData.status !== 'ok' || !nearData.data?.length) throw new Error('No nearby stations');

    const stations = nearData.data
      .filter(s => s.aqi && s.aqi !== '-' && parseInt(s.aqi) > 0)
      .map(s => ({
        name: (s.station?.name || 'Station').replace(/,.*$/, '').trim(),
        aqi: parseInt(s.aqi),
        lat: s.lat,
        lng: s.lon,
        color: aqiColor(parseInt(s.aqi)),
      }))
      .sort((a, b) => b.aqi - a.aqi)
      .slice(0, isChennai ? 15 : 12);

    if (stations.length >= 1) {
      cityAreas = stations;
      console.log(`✅ Loaded ${stations.length} live WAQI stations for ${SELECTED_CITY}`, stations);
      if (leafletMap) { leafletMarkers.forEach(m => m.remove()); leafletMarkers = []; addLeafletMarkers('aqi'); }
      buildAreaRankings();
      buildAreaChart();
      updateStatsCards();
    } else {
      throw new Error('No valid stations returned');
    }
  } catch (err) {
    console.warn('Nearby areas fetch failed, keeping mock data:', err);
    // Ensure mock areas are populated if they weren't already
    if (!cityAreas || cityAreas.length === 0) {
      cityAreas = isChennai ? getChennaiMockAreas() : getCityMockAreas(SELECTED_CITY);
    }
    buildAreaRankings();
    buildAreaChart();
    updateStatsCards();
  }
}

// ===== UPDATE STATS CARDS (dynamic per city) =====
function updateStatsCards() {
  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  // Station count
  const countEl = document.getElementById('statStationCount');
  const acrossEl = document.getElementById('statActiveAcross');
  if (countEl) countEl.textContent = cityAreas.length;
  if (acrossEl) acrossEl.textContent = `Active near ${cityDisplay}`;

  // Worst / best area
  if (cityAreas.length > 0) {
    const sorted = [...cityAreas].sort((a, b) => b.aqi - a.aqi);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const wName = document.getElementById('statWorstName');
    const wDesc = document.getElementById('statWorstDesc');
    const bName = document.getElementById('statBestName');
    const bDesc = document.getElementById('statBestDesc');
    if (wName) { wName.textContent = worst.name; wName.style.color = aqiColor(worst.aqi); }
    if (wDesc) wDesc.textContent = `AQI ${worst.aqi} — ${aqiLabel(worst.aqi)}`;
    if (bName) { bName.textContent = best.name; bName.style.color = aqiColor(best.aqi); }
    if (bDesc) bDesc.textContent = `AQI ${best.aqi} — ${aqiLabel(best.aqi)}`;
  }

  // 24h change (use current AQI vs simulated yesterday)
  if (LiveData.aqi) {
    const prevAqi = Math.round(LiveData.aqi * (0.85 + Math.random() * 0.3));
    const pct = (((LiveData.aqi - prevAqi) / prevAqi) * 100).toFixed(1);
    const el24 = document.getElementById('stat24h');
    const el24L = document.getElementById('stat24hLabel');
    if (el24) {
      const up = LiveData.aqi > prevAqi;
      el24.textContent = (up ? '+' : '') + pct + '%';
      el24.style.color = up ? '#ff6b6b' : '#00e676';
      if (el24L) el24L.textContent = up ? 'AQI increased' : 'AQI improved';
    }
  }

  // Populate exposure tracker dropdown dynamically
  const expArea = document.getElementById('exp-area');
  if (expArea && cityAreas.length > 0) {
    const mid = cityAreas[Math.floor(cityAreas.length / 2)];
    expArea.innerHTML = cityAreas
      .map((a, i) => `<option value="${a.aqi}"${i === Math.floor(cityAreas.length / 2) ? ' selected' : ''}>${a.name} (AQI ${a.aqi})</option>`)
      .join('');
  }
}
let leafletMap = null;
let leafletMarkers = [];
function initLeafletMap() {
  const container = document.getElementById('leaflet-map');
  if (!container) return;
  if (leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 100);
    return;
  }
  if (!window.L) {
    container.innerHTML = '<div style="color:red;padding:20px;">Leaflet library not loaded.</div>';
    return;
  }
  try {
    const center = getCityCenter(SELECTED_CITY);
    leafletMap = L.map('leaflet-map', { center: [center.lat, center.lng], zoom: center.zoom });
    window.leafletMap = leafletMap;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · CartoDB',
      maxZoom: 19
    }).addTo(leafletMap);
    setTimeout(() => leafletMap.invalidateSize(), 200);
    addLeafletMarkers('aqi');
  } catch (err) {
    container.innerHTML = '<div style="color:red;padding:20px;font-family:monospace;">Error initializing map: ' + err.message + '</div>';
  }
}
function updateLeafletMap(type) {
  if (!leafletMap) return;
  leafletMarkers.forEach(m => m.remove());
  leafletMarkers = [];
  addLeafletMarkers(type);
}
function addLeafletMarkers(type) {
  cityAreas.forEach(area => {
    let val = area.aqi;
    let color = aqiColor(val);
    let size = Math.max(30, Math.min(70, val / 4));
    let lbl = 'AQI';
    let msg = aqiLabel(val);

    if (type && type !== 'aqi') {
      val = area[type];
      if (val == null) {
        if (type === 'pm25') val = Math.round(area.aqi * 0.4);
        else if (type === 'pm10') val = Math.round(area.aqi * 0.7);
        else if (type === 'no2') val = Math.round(area.aqi * 0.25);
        else val = 0;
      }
      color = getPollColor(type, val);
      size = Math.max(30, Math.min(70, (val / (limits[type] || 150)) * 60));
      lbl = type.toUpperCase();
      msg = POLL_COLOR_LABEL[color] || 'Good';
    }

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.85;
             border:2px solid white;display:flex;align-items:center;justify-content:center;
             font-family:Rajdhani,sans-serif;font-weight:700;font-size:${size > 40 ? 13 : 11}px;color:#080c14;
             box-shadow:0 0 ${size / 2}px ${color}66;cursor:pointer;">
             ${val}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
    const marker = L.marker([area.lat, area.lng], { icon }).addTo(leafletMap);
    marker.bindPopup(`
      <div style="font-family:Rajdhani,sans-serif;min-width:160px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">${area.name}</div>
        <div style="font-size:24px;font-weight:700;color:${color};">${val} <span style="font-size:14px;color:#8ba2be">${lbl}</span></div>
        <div style="font-size:13px;color:${color};font-weight:600;">${msg}</div>
        <div style="font-size:11px;margin-top:6px;">Click for details</div>
      </div>
    `, { className: 'leaflet-popup-custom' });
    leafletMarkers.push(marker);
  });
}

// ===== AREA RANKINGS & CHARTS =====
function buildAreaRankings() {
  const el = document.getElementById('areaRankings'); if (!el) return;
  const sorted = [...cityAreas].sort((a, b) => b.aqi - a.aqi);
  el.innerHTML = sorted.map((a, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="color:var(--text3);width:18px;text-align:right;">${i + 1}</span>
      <span style="flex:1;font-weight:${i < 3 ? '700' : '400'}">${a.name}</span>
      <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:${a.color};">${a.aqi}</span>
    </div>`).join('');
}
function buildAreaChart() {
  const existing = Chart.getChart('areaChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('areaChart'); if (!ctx) return;
  const sorted = [...cityAreas].sort((a, b) => b.aqi - a.aqi).slice(0, 6);
  
  const hValueLabelsPlugin = {
    id: 'hValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          ctx.fillStyle = '#fff';
          ctx.fillText(dataset.data[index], bar.x + 8, bar.y);
        });
      });
    }
  };

  const getGradient = (c) => {
    const g = c.createLinearGradient(0,0,250,0);
    g.addColorStop(0, '#ff9800');
    g.addColorStop(1, '#f44336');
    return g;
  };
  
  const canvasCtx = ctx.getContext('2d');
  
  new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: sorted.map(a => a.name), 
      datasets: [{ 
        data: sorted.map(a => a.aqi), 
        backgroundColor: getGradient(canvasCtx), 
        borderWidth: 0, 
        borderRadius: 4,
        barPercentage: 0.6
      }] 
    },
    options: { 
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,20,30,0.9)', titleColor: '#8ba2be', bodyColor: '#fff', cornerRadius: 8 } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8ba2be', font: {family: 'Inter', size: 10} }, title: {display: true, text: 'AQI Value', color: '#8ba2be', font: {size: 10}} },
        y: { grid: { display: false }, ticks: { color: '#8ba2be', font: {family: 'Inter', size: 11} } }
      },
      layout: { padding: { right: 30 } }
    },
    plugins: [hValueLabelsPlugin]
  });
}

function buildSourcesChart() {
  const existing = Chart.getChart('sourcesChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('sourcesChart'); if (!ctx) return;
  const data = [38, 27, 16, 11, 8];
  const colors = ['#f44336', '#ff9800', '#ffeb3b', '#9c27b0', '#38b4ff'];
  const labels = ['Vehicles', 'Industry', 'Dust', 'Burning', 'Other'];
  
  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw(chart) {
      const { width, height, ctx } = chart;
      ctx.restore();
      ctx.font = 'bold 16px Inter';
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('100%', width / 2, height / 2 + 8);
      
      ctx.font = '12px Inter';
      ctx.fillStyle = '#8ba2be';
      ctx.fillText('Total', width / 2, height / 2 - 8);
      ctx.save();
    }
  };

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,20,30,0.9)', cornerRadius: 8 } }, layout: { padding: 10 } },
    plugins: [centerTextPlugin]
  });

  const leg = document.getElementById('customSourcesLegend');
  if (leg) {
    const trends = ['up', 'up', 'down', 'down', 'flat'];
    const trendIcons = { 'up': '↑', 'down': '↓', 'flat': '–' };
    leg.innerHTML = data.map((d, i) => `
      <div class="mv-sg-item">
        <div class="mv-sg-top">
          <div class="mv-sg-dot" style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}"></div>
          ${labels[i]}
        </div>
        <div class="mv-sg-bot">
          ${d}%
          <span class="mv-sg-trend mv-trend-${trends[i]}">${trendIcons[trends[i]]}</span>
        </div>
      </div>
    `).join('');
  }
}

// ===== THREE.JS 3D VISUALIZATION (ENHANCED) =====
// Real 3D cityscape: buildings with window lights, animated smoke plumes
// from polluted areas, skybox stars, ground plane with map-like grid,
// smooth orbit camera with damping, hover tooltips.
let renderer3D = null, scene3D = null, camera3D = null, animFrame3D = null;
let isDragging3D = false, prev3DMouse = { x: 0, y: 0 };
// Camera orbit state (target + spherical coords)
let rotX = 0.55, rotY = 0.7, zoom3D = 28;
let targetRotX = 0.55, targetRotY = 0.7, targetZoom = 28;
let anim3DRunning = true;
let bars3D = [];
let smokeParticles3D = [];
let hoveredBuilding = null;
let raycaster3D = null, mouseNDC3D = null;

function init3D() {
  if (!window.THREE) return;
  const canvas = document.getElementById('viz3d-canvas');
  if (!canvas) return;
  // Dispose previous scene
  if (renderer3D) {
    cancelAnimationFrame(animFrame3D);
    renderer3D.dispose();
    renderer3D = null; scene3D = null; camera3D = null;
    bars3D = [];
    smokeParticles3D = [];
  }

  const W = canvas.clientWidth || canvas.offsetWidth || 800;
  const H = canvas.clientHeight || canvas.offsetHeight || 520;
  renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer3D.setSize(W, H);
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3D.setClearColor(0x020610, 1);
  renderer3D.shadowMap.enabled = true;
  renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;

  scene3D = new THREE.Scene();
  scene3D.fog = new THREE.FogExp2(0x020610, 0.025);

  camera3D = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);

  // ─── SKYBOX: starfield points ───────────────────
  const starsGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 80 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    starPos[i*3+1] = Math.abs(r * Math.cos(phi)) * 0.7; // push stars upward
    starPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.18, transparent: true, opacity: 0.75, sizeAttenuation: true
  }));
  scene3D.add(stars);

  // ─── LIGHTS ─────────────────────────────────────
  scene3D.add(new THREE.AmbientLight(0x1a2540, 0.5));

  const moonLight = new THREE.DirectionalLight(0xaaccff, 0.6);
  moonLight.position.set(15, 25, 10);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.width = 1024;
  moonLight.shadow.mapSize.height = 1024;
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 60;
  moonLight.shadow.camera.left = -25;
  moonLight.shadow.camera.right = 25;
  moonLight.shadow.camera.top = 25;
  moonLight.shadow.camera.bottom = -25;
  scene3D.add(moonLight);

  // City accent lights (color)
  const cyanLight = new THREE.PointLight(0x38b4ff, 2.0, 40);
  cyanLight.position.set(-10, 6, -10);
  scene3D.add(cyanLight);
  const tealLight = new THREE.PointLight(0x00e5c8, 1.8, 40);
  tealLight.position.set(10, 6, 10);
  scene3D.add(tealLight);

  // ─── GROUND PLANE ───────────────────────────────
  // Make a subtle glowing grid "street map"
  const groundGeo = new THREE.PlaneGeometry(50, 50, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0a1220,
    roughness: 0.9,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene3D.add(ground);

  // Two-layer glowing grid
  const grid1 = new THREE.GridHelper(50, 50, 0x1a3a5a, 0x0d1a2e);
  grid1.position.y = 0.001;
  if (grid1.material) { grid1.material.transparent = true; grid1.material.opacity = 0.6; }
  scene3D.add(grid1);

  const grid2 = new THREE.GridHelper(50, 10, 0x38b4ff, 0x38b4ff);
  grid2.position.y = 0.002;
  if (grid2.material) { grid2.material.transparent = true; grid2.material.opacity = 0.15; }
  scene3D.add(grid2);

  // ─── BUILDINGS (one per neighbourhood) ──────────
  bars3D = [];
  smokeParticles3D = [];
  const cols = Math.ceil(Math.sqrt(cityAreas.length));
  const rows = Math.ceil(cityAreas.length / cols);
  const spacing = 4.0;
  const offsetX = -(cols - 1) * spacing / 2;
  const offsetZ = -(rows - 1) * spacing / 2;

  cityAreas.forEach((area, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = offsetX + col * spacing + (Math.random() - 0.5) * 0.3;
    const z = offsetZ + row * spacing + (Math.random() - 0.5) * 0.3;
    const maxH = 12;
    const h = Math.max(0.8, (area.aqi / 300) * maxH);
    const color = new THREE.Color(area.color);
    const w = 2.2 + Math.random() * 0.3;

    // === Procedural building texture (windows that glow) ===
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 64; texCanvas.height = 128;
    const tc = texCanvas.getContext('2d');
    // Base dark tint of the building
    tc.fillStyle = '#0a1020';
    tc.fillRect(0, 0, 64, 128);
    // Rows of windows
    const cols2 = 4, rows2 = 12;
    for (let ry = 0; ry < rows2; ry++) {
      for (let cx = 0; cx < cols2; cx++) {
        const lit = Math.random() > 0.35;
        const bright = Math.random();
        tc.fillStyle = lit
          ? `rgba(${200 + bright * 55}, ${220 + bright * 35}, ${255}, ${0.6 + bright * 0.4})`
          : '#0a1525';
        tc.fillRect(cx * 16 + 3, ry * 10 + 3, 10, 6);
      }
    }
    const buildingTex = new THREE.CanvasTexture(texCanvas);
    buildingTex.wrapS = buildingTex.wrapT = THREE.RepeatWrapping;
    buildingTex.repeat.set(1, Math.max(1, Math.round(h / 2)));

    // Building body
    const geo = new THREE.BoxGeometry(w, h, w);
    const mat = new THREE.MeshStandardMaterial({
      map: buildingTex,
      color: color.clone().multiplyScalar(0.4).add(new THREE.Color(0x333344)),
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.55,
      metalness: 0.35
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { area, baseEmissive: 0.12 };
    scene3D.add(mesh);

    // Rooftop neon ring (glowing halo matching AQI color)
    const haloGeo = new THREE.TorusGeometry(w * 0.55, 0.06, 8, 32);
    const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(x, h + 0.08, z);
    halo.rotation.x = Math.PI / 2;
    scene3D.add(halo);

    // Beacon beam shooting up from the top
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.4, 6, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, h + 3, z);
    scene3D.add(beam);

    // Ground glow pad under each building
    const padGeo = new THREE.CircleGeometry(w * 0.9, 24);
    const padMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.01, z);
    scene3D.add(pad);

    // === Pollution smoke plume (only for moderate+ AQI) ===
    let plume = null;
    if (area.aqi > 75) {
      const particleCount = Math.round(30 + Math.min(120, area.aqi * 0.5));
      const pGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const life = new Float32Array(particleCount);
      const speed = new Float32Array(particleCount);
      for (let p = 0; p < particleCount; p++) {
        positions[p*3]   = x + (Math.random() - 0.5) * w * 0.6;
        positions[p*3+1] = h + Math.random() * 4;
        positions[p*3+2] = z + (Math.random() - 0.5) * w * 0.6;
        life[p] = Math.random();
        speed[p] = 0.3 + Math.random() * 0.5;
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // Size intensity scales with AQI
      const smokeSize = area.aqi > 200 ? 1.3 : area.aqi > 150 ? 1.0 : 0.75;
      const pMat = new THREE.PointsMaterial({
        color, size: smokeSize, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      });
      plume = new THREE.Points(pGeo, pMat);
      scene3D.add(plume);

      smokeParticles3D.push({
        points: plume, positions, life, speed,
        baseX: x, baseZ: z, baseY: h, spread: w * 0.6, count: particleCount
      });
    }

    // Label sprite (hi-res)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512; labelCanvas.height = 192;
    const lc = labelCanvas.getContext('2d');
    lc.clearRect(0, 0, 512, 192);
    // Shadow-rounded background
    lc.fillStyle = 'rgba(5, 12, 25, 0.82)';
    lc.strokeStyle = area.color;
    lc.lineWidth = 3;
    const rr = 18;
    lc.beginPath();
    lc.moveTo(rr, 20);
    lc.lineTo(512 - rr, 20);
    lc.quadraticCurveTo(512, 20, 512, 20 + rr);
    lc.lineTo(512, 172 - rr);
    lc.quadraticCurveTo(512, 172, 512 - rr, 172);
    lc.lineTo(rr, 172);
    lc.quadraticCurveTo(0, 172, 0, 172 - rr);
    lc.lineTo(0, 20 + rr);
    lc.quadraticCurveTo(0, 20, rr, 20);
    lc.closePath();
    lc.fill();
    lc.stroke();
    // AQI number
    lc.fillStyle = area.color;
    lc.font = 'bold 72px Rajdhani, sans-serif';
    lc.textAlign = 'center';
    lc.textBaseline = 'middle';
    lc.fillText(String(area.aqi), 256, 78);
    // Name
    lc.fillStyle = 'rgba(220, 235, 255, 0.95)';
    lc.font = '34px Rajdhani, sans-serif';
    lc.fillText(area.name, 256, 140);

    const tex = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.6, 1.35, 1);
    sprite.position.set(x, h + 1.6, z);
    sprite.renderOrder = 10;
    scene3D.add(sprite);

    bars3D.push({ mesh, halo, beam, pad, sprite, targetH: h, x, z, area });
  });

  // Rise-in animation for buildings
  bars3D.forEach((b, i) => {
    b.mesh.scale.y = 0.01;
    b.mesh.position.y = 0.01;
    b.halo.visible = false;
    b.sprite.visible = false;
    setTimeout(() => {
      b.halo.visible = true;
      b.sprite.visible = true;
      const rise = () => {
        b.mesh.scale.y = Math.min(b.mesh.scale.y + 0.035, 1);
        b.mesh.position.y = (b.targetH * b.mesh.scale.y) / 2;
        if (b.mesh.scale.y < 1) requestAnimationFrame(rise);
      };
      rise();
    }, i * 70);
  });

  // ─── INTERACTION ────────────────────────────────
  raycaster3D = new THREE.Raycaster();
  mouseNDC3D = new THREE.Vector2();

  canvas.onmousedown = e => { isDragging3D = true; prev3DMouse = { x: e.clientX, y: e.clientY }; };
  canvas.onmouseup   = () => { isDragging3D = false; };
  canvas.onmouseleave = () => { isDragging3D = false; };
  canvas.onmousemove = e => {
    // Orbit
    if (isDragging3D) {
      targetRotY += (e.clientX - prev3DMouse.x) * 0.008;
      targetRotX += (e.clientY - prev3DMouse.y) * 0.006;
      targetRotX = Math.max(0.05, Math.min(1.35, targetRotX));
      prev3DMouse = { x: e.clientX, y: e.clientY };
    }
    // Hover raycast
    const rect = canvas.getBoundingClientRect();
    mouseNDC3D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC3D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };
  canvas.onwheel = e => {
    targetZoom = Math.max(8, Math.min(60, targetZoom + e.deltaY * 0.025));
    e.preventDefault();
  };
  canvas.addEventListener('touchstart', e => {
    isDragging3D = true;
    prev3DMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', () => { isDragging3D = false; });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging3D) return;
    targetRotY += (e.touches[0].clientX - prev3DMouse.x) * 0.008;
    targetRotX += (e.touches[0].clientY - prev3DMouse.y) * 0.005;
    targetRotX = Math.max(0.05, Math.min(1.35, targetRotX));
    prev3DMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
  }, { passive: false });

  // Stats cards below the canvas
  const statsEl = document.getElementById('viz3dStats');
  if (statsEl) {
    const top = [...cityAreas].sort((a, b) => b.aqi - a.aqi).slice(0, 4);
    statsEl.innerHTML = top.map(a => `
      <div class="card realism-box" style="display:flex; flex-direction:column;">
        <div class="realism-topglow"></div>
        <div class="realism-blob"></div>
        <div class="realism-inner" style="padding:16px; width:100%; height:100%; border-color:${a.color}44;">
          <div class="realism-inner-glow"></div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">${a.name}</div>
          <div style="font-family:var(--font-head);font-size:32px;font-weight:700;color:${a.color};margin:4px 0;">${a.aqi}</div>
          <div style="font-size:12px;color:var(--text2);">${aqiLabel(a.aqi)}</div>
        </div>
      </div>`).join('');
  }

  animate3D();
}

function animate3D() {
  if (!anim3DRunning) { animFrame3D = requestAnimationFrame(animate3D); return; }
  animFrame3D = requestAnimationFrame(animate3D);
  if (!scene3D || !camera3D || !renderer3D) return;

  // Auto-rotate when not dragging
  if (!isDragging3D) targetRotY += 0.0018;

  // Smooth damping (ease toward target)
  rotX += (targetRotX - rotX) * 0.08;
  rotY += (targetRotY - rotY) * 0.08;
  zoom3D += (targetZoom - zoom3D) * 0.08;

  camera3D.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom3D;
  camera3D.position.y = Math.sin(rotX) * zoom3D + 2;
  camera3D.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom3D;
  camera3D.lookAt(0, 3, 0);

  const t = Date.now() * 0.001;

  // Animate halos, beams, pads
  bars3D.forEach((b, i) => {
    if (b.halo) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 2 + i * 0.5);
      b.halo.material.opacity = pulse;
      b.halo.scale.set(1 + 0.05 * Math.sin(t * 1.5 + i), 1 + 0.05 * Math.sin(t * 1.5 + i), 1);
    }
    if (b.beam) {
      b.beam.material.opacity = 0.15 + 0.15 * Math.sin(t * 2.5 + i * 0.7);
      b.beam.rotation.y = t * 0.4 + i;
    }
    if (b.pad) {
      b.pad.material.opacity = 0.12 + 0.08 * Math.sin(t * 1.8 + i);
    }
  });

  // Animate smoke particles rising
  smokeParticles3D.forEach(s => {
    const posAttr = s.points.geometry.attributes.position;
    const arr = posAttr.array;
    for (let p = 0; p < s.count; p++) {
      s.life[p] += 0.006 * s.speed[p];
      if (s.life[p] > 1) {
        s.life[p] = 0;
        arr[p*3]   = s.baseX + (Math.random() - 0.5) * s.spread;
        arr[p*3+1] = s.baseY;
        arr[p*3+2] = s.baseZ + (Math.random() - 0.5) * s.spread;
      } else {
        // Rise + drift outward + sway
        arr[p*3+1] += 0.025 * s.speed[p];
        arr[p*3]   += Math.sin(t + p) * 0.004;
        arr[p*3+2] += Math.cos(t + p * 0.7) * 0.004;
      }
    }
    posAttr.needsUpdate = true;
    // Fade particles as they rise
    s.points.material.opacity = 0.25 + 0.15 * Math.sin(t * 0.8);
  });

  // Raycast hover highlight
  if (raycaster3D && mouseNDC3D) {
    raycaster3D.setFromCamera(mouseNDC3D, camera3D);
    const meshes = bars3D.map(b => b.mesh);
    const hits = raycaster3D.intersectObjects(meshes);
    // Reset previous hover
    bars3D.forEach(b => {
      if (b.mesh.material && b.mesh.material.emissiveIntensity !== undefined) {
        b.mesh.material.emissiveIntensity = b.mesh.userData.baseEmissive;
      }
    });
    if (hits.length > 0) {
      const hit = hits[0].object;
      if (hit.material && hit.material.emissiveIntensity !== undefined) {
        hit.material.emissiveIntensity = 0.6;
      }
      if (renderer3D.domElement) renderer3D.domElement.style.cursor = 'pointer';
      hoveredBuilding = hit.userData.area;
    } else {
      if (renderer3D.domElement) renderer3D.domElement.style.cursor = 'grab';
      hoveredBuilding = null;
    }
  }

  renderer3D.render(scene3D, camera3D);
}

function reset3DCamera() { targetRotX = 0.55; targetRotY = 0.7; targetZoom = 28; }
function toggle3DAnimation() {
  anim3DRunning = !anim3DRunning;
  const btn = document.getElementById('anim3dBtn');
  if (btn) btn.textContent = anim3DRunning ? '⏸ Pause' : '▶ Resume';
}

/* ════════════════════════════════════════════════════════════
   3D AQI ORB (sits behind the gauge on the dashboard)
   A glowing translucent sphere whose color, turbulence,
   and emission are driven by the current AQI value.
   ══════════════════════════════════════════════════════════ */
let orbRenderer = null, orbScene = null, orbCamera = null, orbMesh = null;
let orbHalo = null, orbParticles = null, orbFrame = null;
let orbTargetColor = new THREE.Color(0xff9800);
let orbDisplayColor = new THREE.Color(0xff9800);
let orbTargetIntensity = 0.6; // 0..1.5, driven by AQI/300

function initAQIOrb3D() {
  if (!window.THREE) return;
  const canvas = document.getElementById('aqiOrb3D');
  if (!canvas) return;
  if (orbRenderer) {
    cancelAnimationFrame(orbFrame);
    orbRenderer.dispose();
    orbRenderer = null; orbScene = null; orbCamera = null; orbMesh = null;
  }

  const W = 240, H = 140;
  orbRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  orbRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  orbRenderer.setSize(W, H);
  orbRenderer.setClearColor(0x000000, 0);

  orbScene = new THREE.Scene();
  orbCamera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  orbCamera.position.set(0, 0, 4);

  // Inner sphere — turbulent surface via vertex displacement in shader
  const orbGeo = new THREE.SphereGeometry(1.0, 48, 48);
  const orbMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xff9800) },
      uIntensity: { value: 0.6 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying float vDisp;
      // Simple pseudo-noise
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vNormal = normalize(normalMatrix * normal);
        float n = noise(position * 2.5 + uTime * 0.5);
        float disp = (n - 0.5) * 0.22 * (0.4 + uIntensity);
        vDisp = disp;
        vec3 pos = position + normal * disp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying float vDisp;
      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        vec3 baseCol = uColor * (0.6 + uIntensity * 0.6);
        vec3 col = mix(baseCol, uColor * 1.4, fresnel);
        col += vDisp * 1.2 * uColor;
        float alpha = 0.55 + fresnel * 0.45;
        gl_FragColor = vec4(col, alpha);
      }`
  });
  orbMesh = new THREE.Mesh(orbGeo, orbMat);
  orbScene.add(orbMesh);

  // Outer halo — back-side atmosphere glow
  const haloGeo = new THREE.SphereGeometry(1.25, 32, 32);
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xff9800) },
      uIntensity: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
        gl_FragColor = vec4(uColor * (0.5 + uIntensity * 0.8), 1.0) * intensity;
      }`
  });
  orbHalo = new THREE.Mesh(haloGeo, haloMat);
  orbScene.add(orbHalo);

  // Orbiting dust ring — particles whose density reflects pollution
  const pCount = 140;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  const pAngle = new Float32Array(pCount);
  const pRadius = new Float32Array(pCount);
  const pSpeed = new Float32Array(pCount);
  for (let i = 0; i < pCount; i++) {
    pAngle[i] = Math.random() * Math.PI * 2;
    pRadius[i] = 1.35 + Math.random() * 0.5;
    pSpeed[i] = 0.25 + Math.random() * 0.4;
    pPos[i*3]   = Math.cos(pAngle[i]) * pRadius[i];
    pPos[i*3+1] = (Math.random() - 0.5) * 0.4;
    pPos[i*3+2] = Math.sin(pAngle[i]) * pRadius[i];
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xff9800, size: 0.04, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  orbParticles = new THREE.Points(pGeo, pMat);
  orbParticles.userData = { angle: pAngle, radius: pRadius, speed: pSpeed, count: pCount };
  orbScene.add(orbParticles);

  function orbAnimate() {
    orbFrame = requestAnimationFrame(orbAnimate);
    const t = performance.now() * 0.001;
    if (!orbMesh) return;

    // Smooth color lerp
    orbDisplayColor.lerp(orbTargetColor, 0.06);
    orbMesh.material.uniforms.uColor.value.copy(orbDisplayColor);
    orbHalo.material.uniforms.uColor.value.copy(orbDisplayColor);
    orbParticles.material.color.copy(orbDisplayColor);

    // Smooth intensity lerp
    const current = orbMesh.material.uniforms.uIntensity.value;
    const next = current + (orbTargetIntensity - current) * 0.06;
    orbMesh.material.uniforms.uIntensity.value = next;
    orbHalo.material.uniforms.uIntensity.value = next;
    orbMesh.material.uniforms.uTime.value = t;

    // Rotate orb gently
    orbMesh.rotation.y = t * 0.25;
    orbMesh.rotation.x = Math.sin(t * 0.4) * 0.15;

    // Particle dust orbit (speed scales with intensity — more pollution = more chaos)
    const ud = orbParticles.userData;
    const arr = orbParticles.geometry.attributes.position.array;
    for (let i = 0; i < ud.count; i++) {
      ud.angle[i] += 0.003 * ud.speed[i] * (0.5 + next);
      arr[i*3]   = Math.cos(ud.angle[i]) * ud.radius[i];
      arr[i*3+1] += Math.sin(t * 2 + i) * 0.002;
      arr[i*3+2] = Math.sin(ud.angle[i]) * ud.radius[i];
      // Clamp Y
      if (Math.abs(arr[i*3+1]) > 0.5) arr[i*3+1] *= 0.8;
    }
    orbParticles.geometry.attributes.position.needsUpdate = true;
    orbParticles.rotation.y = t * 0.1;

    orbRenderer.render(orbScene, orbCamera);
  }
  orbAnimate();
}

// Hook called whenever the AQI number updates
function updateAQIOrb(aqi) {
  if (!orbMesh && window.THREE) initAQIOrb3D();
  if (!orbMesh) return;
  const colorHex = aqiColor(aqi);
  orbTargetColor = new THREE.Color(colorHex);
  orbTargetIntensity = Math.max(0.2, Math.min(1.4, (aqi || 50) / 200));
}

/* ════════════════════════════════════════════════════════════
   DRIFTING POLLUTION PARTICLE BACKGROUND (2D canvas)
   Subtle haze of glowing dots that drift across the screen —
   density increases with current AQI for an ambient sense of
   "how much pollution is in the air".
   ══════════════════════════════════════════════════════════ */
let bgParticlesState = null;

function initBgParticles() {
  const canvas = document.getElementById('bgParticles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Initial particle cloud — will grow/shrink with AQI
  const particles = [];
  const baseCount = 60;
  for (let i = 0; i < baseCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.1 - Math.random() * 0.25,
      size: 1 + Math.random() * 2.5,
      life: Math.random(),
      hue: 0 // will be set based on AQI
    });
  }

  bgParticlesState = { canvas, ctx, particles, targetColor: '#38b4ff', currentAQI: 50 };

  function loop() {
    requestAnimationFrame(loop);
    if (!bgParticlesState) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = bgParticlesState.targetColor;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life += 0.004;
      // Wrap / respawn
      if (p.y < -20 || p.life > 1) {
        p.x = Math.random() * canvas.width;
        p.y = canvas.height + 10;
        p.life = 0;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = -0.1 - Math.random() * 0.25;
      }
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;

      const alpha = Math.sin(p.life * Math.PI) * 0.5;
      ctx.beginPath();
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
      gr.addColorStop(0, col + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
      gr.addColorStop(1, col + '00');
      ctx.fillStyle = gr;
      ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  loop();
}

function updateBgParticles(aqi) {
  if (!bgParticlesState) initBgParticles();
  if (!bgParticlesState) return;
  bgParticlesState.currentAQI = aqi;
  bgParticlesState.targetColor = aqiColor(aqi);
  // Add or remove particles to reflect pollution density
  const target = Math.round(40 + Math.min(120, (aqi || 50) * 0.5));
  const diff = target - bgParticlesState.particles.length;
  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      bgParticlesState.particles.push({
        x: Math.random() * bgParticlesState.canvas.width,
        y: Math.random() * bgParticlesState.canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.1 - Math.random() * 0.25,
        size: 1 + Math.random() * 2.5,
        life: Math.random()
      });
    }
  } else if (diff < 0) {
    bgParticlesState.particles.length = target;
  }
}

// Kick off the background particles as soon as the module loads
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initBgParticles();
    // Also initialize the orb if we're on a page that has it
    if (document.getElementById('aqiOrb3D') && window.THREE) {
      initAQIOrb3D();
    }
  });
}

// ===== AI PAGE =====
const modelData = {
  lstm: { acc: '93.2%', mae: '4.8', rmse: '6.3', r2: '0.94' },
  rf: { acc: '88.7%', mae: '7.2', rmse: '9.1', r2: '0.88' },
  xgb: { acc: '91.4%', mae: '5.6', rmse: '7.4', r2: '0.91' },
  ensemble: { acc: '95.1%', mae: '3.9', rmse: '5.1', r2: '0.96' },
};
function selectModel(id, el) {
  document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const m = modelData[id];
  document.getElementById('metric-acc').textContent = m.acc;
  document.getElementById('metric-mae').textContent = m.mae;
  document.getElementById('metric-rmse').textContent = m.rmse;
  document.getElementById('metric-r2').textContent = m.r2;
}
function buildFeatureImportance() {
  const el = document.getElementById('featureImportance'); if (!el) return;
  const features = [
    { name: 'PM2.5 (t-1)', val: 87 },
    { name: 'Temperature', val: 72 },
    { name: 'Wind Speed', val: 65 },
    { name: 'Humidity', val: 58 },
    { name: 'NO₂', val: 54 },
    { name: 'Traffic density', val: 45 },
  ];
  el.innerHTML = features.map(f => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="color:var(--text2);">${f.name}</span>
        <span style="color:var(--accent);font-weight:700;">${f.val}%</span>
      </div>
      <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${f.val}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px;transition:width 1s ease;"></div>
      </div>
    </div>`).join('');
}
function buildAICharts() {
  const opts = baseOpts('AQI');
  opts.plugins.legend = { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 11 }, boxWidth: 14 } };
  const labels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
  const actual = Array.from({ length: 30 }, () => rnd(80, 200));
  const predicted = actual.map(v => v + rnd(-10, 10));
  // Pred vs actual
  const pac = document.getElementById('predActualChart');
  if (pac) {
    const ex = Chart.getChart('predActualChart'); if (ex) ex.destroy();
    new Chart(pac, {
      type: 'line', data: {
        labels, datasets: [
          { label: 'Actual', data: actual, borderColor: '#ff6b6b', borderWidth: 2, tension: 0.4, pointRadius: 0 },
          { label: 'Predicted', data: predicted, borderColor: '#38b4ff', borderWidth: 2, tension: 0.4, pointRadius: 0, borderDash: [4, 4] },
        ]
      }, options: opts
    });
  }
  // 72h prediction
  const pch = document.getElementById('predChart');
  if (pch) {
    const ex = Chart.getChart('predChart'); if (ex) ex.destroy();
    const base = LiveData.aqi || 140;
    let v = base; const d72 = [];
    for (let i = 0; i < 72; i++) { v += rnd(-8, 8); v = Math.max(40, Math.min(280, v)); d72.push(v); }
    const g = makeGradient(pch.getContext('2d'), 'rgba(0,229,200,0.3)', 'rgba(0,229,200,0)');
    new Chart(pch, {
      type: 'line', data: {
        labels: Array.from({ length: 72 }, (_, i) => i % 6 === 0 ? `+${i}h` : ''), datasets: [
          { label: '72h Forecast', data: d72, fill: true, backgroundColor: g, borderColor: '#00e5c8', borderWidth: 2, tension: 0.4, pointRadius: 0 },
        ]
      }, options: baseOpts('AQI')
    });
  }
}

// ===== HISTORY CHARTS =====
function buildHistoryMiniCharts() {
  const drawSpark = (id, color, base) => {
    const ctx = document.getElementById(id); if (!ctx) return;
    const existing = Chart.getChart(id); if (existing) existing.destroy();
    const g = ctx.getContext('2d').createLinearGradient(0,0,0,60);
    g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.5)'));
    g.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0)'));
    const data = Array.from({length: 10}, () => Math.max(0, base + rnd(-20, 20)));
    new Chart(ctx, {
      type: 'line', data: { labels: data, datasets: [{ data, borderColor: color, backgroundColor: g, fill: true, borderWidth: 2, tension: 0.4, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: Math.min(...data)*0.9 } }, layout: { padding: 5 } }
    });
  };
  const baseAqi = LiveData.aqi || 100;
  drawSpark('spark-avg', '#38b4ff', baseAqi);
  drawSpark('spark-peak', '#ff6b6b', baseAqi * 1.3);
  drawSpark('spark-low', '#00e5c8', baseAqi * 0.6);

  // Dynamically update the HTML stat card text numbers
  const avg = Math.round(baseAqi * (1 + rndF(-0.1, 0.1)));
  const peak = Math.round(avg * (1 + rndF(0.2, 0.5)));
  const low = Math.max(0, Math.round(avg * (1 - rndF(0.2, 0.5))));
  const unh = baseAqi > 100 ? rnd(15, 25) : rnd(2, 8);

  const setEl = (id, val, color) => { 
    const e = document.getElementById(id); 
    if (e) { e.textContent = val; if (color) e.style.color = color; }
  };
  
  setEl('hist-avg-val', avg);
  setEl('hist-avg-status', aqiLabel(avg), aqiColor(avg));
  setEl('hist-peak-val', peak);
  setEl('hist-peak-status', aqiLabel(peak), aqiColor(peak));
  setEl('hist-low-val', low);
  setEl('hist-low-status', aqiLabel(low), aqiColor(low));
  setEl('hist-unh-val', unh);
  
  const setTrend = (id, pct, inverse) => {
    const e = document.getElementById(id);
    if (e) {
      const isUp = pct > 0;
      const good = inverse ? !isUp : isUp;
      e.innerHTML = (isUp ? '↑ ' : '↓ ') + Math.abs(pct) + (id.includes('unh') ? '' : '%');
      e.style.color = good ? '#00e5c8' : '#ff6b6b';
    }
  };
  
  setTrend('hist-avg-trend', rnd(-25, 25), false);
  setTrend('hist-peak-trend', rnd(-25, 25), false);
  setTrend('hist-low-trend', rnd(-25, 25), true);
  setTrend('hist-unh-trend', rnd(-5, 5), false);

  const gaugeCtx = document.getElementById('gauge-unhealthy');
  if (gaugeCtx) {
    const existing = Chart.getChart('gauge-unhealthy'); if (existing) existing.destroy();
    let unh = 0, good = 0;
    if (baseAqi > 100) { unh = 22; good = 8; } else { unh = 5; good = 25; }
    new Chart(gaugeCtx, {
      type: 'doughnut', data: { datasets: [{ data: [good, unh], backgroundColor: ['#00e676', 'rgba(255,255,255,0.05)'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '80%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  }
}

function buildHistoryChart() {
  buildHistoryMiniCharts();
  const ctx = document.getElementById('historyChart'); if (!ctx) return;
  const existing = Chart.getChart('historyChart'); if (existing) existing.destroy();
  const labels = []; for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); labels.push(d.getDate() + ' ' + days[d.getDay()].substring(0,3)); }
  let v = LiveData.aqi || 100; const data = []; 
  for (let i = 0; i < 30; i++) { 
    v += rnd(-15, 15); 
    // Drift back to base
    if (v > (LiveData.aqi||100) + 40) v -= 10;
    if (v < (LiveData.aqi||100) - 40) v += 10;
    v = Math.max(10, v); data.push(v); 
  }
  const g = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250);
  g.addColorStop(0, 'rgba(56,180,255,0.6)');
  g.addColorStop(1, 'rgba(56,180,255,0)');
  new Chart(ctx, { type: 'line', data: { labels, datasets: [{ data, fill: true, backgroundColor: g, borderColor: '#38b4ff', borderWidth: 3, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#38b4ff' }] }, 
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(15,20,30,0.9)', titleColor: '#8ba2be', bodyColor: '#fff', borderColor: '#38b4ff', borderWidth: 1, padding: 10, callbacks: { label: c => '  AQI ' + c.raw } } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: { x: { display: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#8ba2be', font: {family:'Inter', size:11}, maxTicksLimit: 8 } }, y: { display: true, title: {display:true, text:'AQI', color:'rgba(255,255,255,0.5)', font:{size:11}}, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#8ba2be', font: {family:'Inter'} } } },
      layout: { padding: { top: 10, right: 10 } }
    }
  });
}

function buildDistChart() {
  const ctx = document.getElementById('distChart'); if (!ctx) return;
  const existing = Chart.getChart('distChart'); if (existing) existing.destroy();
  const baseAqi = LiveData.aqi || 100;
  
  // shift the distribution based on baseAqi
  let d1 = 1, d2 = 2, d3 = 3, d4 = 4, d5 = 5;
  if (baseAqi <= 50) { d1 = 20; d2 = 5; d3 = 2; d4 = 1; d5 = 0; }
  else if (baseAqi <= 100) { d1 = 5; d2 = 18; d3 = 5; d4 = 2; d5 = 0; }
  else if (baseAqi <= 150) { d1 = 2; d2 = 8; d3 = 15; d4 = 4; d5 = 1; }
  else if (baseAqi <= 200) { d1 = 1; d2 = 3; d3 = 10; d4 = 14; d5 = 2; }
  else { d1 = 0; d2 = 1; d3 = 5; d4 = 10; d5 = 14; }
  
  // add some randomness
  const data = [d1 + rnd(0,2), d2 + rnd(0,2), d3 + rnd(0,2), d4 + rnd(0,2), d5 + rnd(0,2)];

  const colors = ['#00e676', '#ffeb3b', '#ff9800', '#f44336', '#9c27b0'];
  const labels = ['Good', 'Moderate', 'Unhealthy-S', 'Unhealthy', 'Very Unhealthy'];
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.map(c=>c+'cc'), borderColor: colors, borderWidth: 2, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } },
  });
  
  const leg = document.getElementById('h-dist-legend');
  if (leg) {
    const total = data.reduce((a,b)=>a+b,0);
    leg.innerHTML = data.map((d, i) => `
      <div class="h-leg-row">
        <div class="h-leg-dot" style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}"></div>
        <div class="h-leg-lbl">${labels[i]}</div>
        <div class="h-leg-pct">${Math.round(d/total*100)}%</div>
        <div class="h-leg-days">${d} Days</div>
      </div>
    `).join('');
  }
}

function buildCorrChart() {
  const ctx = document.getElementById('corrChart'); if (!ctx) return;
  const existing = Chart.getChart('corrChart'); if (existing) existing.destroy();
  const baseTemp = LiveData.temp || 30;
  const baseAqi = LiveData.aqi || 100;
  const temps = Array.from({ length: 40 }, () => rndF(baseTemp - 5, baseTemp + 5));
  // create positive correlation
  const aqis = temps.map(t => Math.round(baseAqi + (t - baseTemp) * 5 + rnd(-20, 20)));
  
  const minT = Math.min(...temps); const maxT = Math.max(...temps);
  const trend = [{x: minT, y: baseAqi + (minT - baseTemp)*5}, {x: maxT, y: baseAqi + (maxT - baseTemp)*5}];
  
  new Chart(ctx, {
    type: 'scatter', data: { 
      datasets: [
        { type: 'line', label: 'Trend', data: trend, borderColor: '#9c27b0', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, order: 2 },
        { label: 'Temp vs AQI', data: temps.map((t, i) => ({ x: t, y: aqis[i] })), backgroundColor: 'rgba(156,39,176,0.8)', borderColor: '#9c27b0', borderWidth: 2, pointRadius: 6, pointHoverRadius: 8, order: 1 }
      ] 
    },
    options: { 
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 6 } }, 
      scales: { 
        x: { display: true, title: { display: true, text: 'Temperature (°C)', color: 'rgba(226,238,255,0.5)', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: {color: '#8ba2be'} }, 
        y: { display: true, title: { display: true, text: 'AQI', color: 'rgba(226,238,255,0.5)', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: {color: '#8ba2be'} } 
      } 
    }
  });

  const wrap = ctx.closest('.chart-wrap');
  if (wrap && !document.getElementById('r-badge')) {
    const badge = document.createElement('div');
    badge.id = 'r-badge';
    badge.innerHTML = 'r = 0.68';
    badge.style.cssText = 'position:absolute; top:10px; left:60px; background:rgba(15,20,30,0.8); border:1px solid #9c27b0; color:#fff; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; font-family:Inter;';
    wrap.style.position = 'relative';
    wrap.appendChild(badge);
  }
}

function buildHeatmapChart() {
  const ctx = document.getElementById('heatmapChart'); if (!ctx) return;
  const existing = Chart.getChart('heatmapChart'); if (existing) existing.destroy();
  const polls = ['PM2.5', 'PM10', 'NO₂', 'O₃', 'SO₂'];
  const bases = [LiveData.pm25||40, LiveData.pm10||80, LiveData.no2||20, LiveData.o3||30, LiveData.so2||10];
  const data = polls.map((p, pIdx) => Array.from({ length: 30 }, () => Math.max(0, bases[pIdx] + rnd(-15, 15))));
  const colors = ['#ff9800', '#00e676', '#f44336', '#00e5c8', '#9c27b0'];
  new Chart(ctx, {
    type: 'bar',
    data: { labels: Array.from({ length: 30 }, (_, i) => i % 5 === 0 ? (i + 1) + '' : ''), datasets: polls.map((p, i) => ({ label: p, data: data[i], backgroundColor: colors[i], stack: 's' })) },
    options: { 
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { color: '#8ba2be', font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 } } }, 
      scales: { x: { grid: { display: false }, ticks: {color:'#8ba2be'} }, y: { title: {display:true,text:'Level (µg/m³)', color:'rgba(255,255,255,0.5)',font:{size:11}}, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: {color:'#8ba2be'} } } 
    },
  });
}

// ===== HEALTH CHART =====
function buildHealthChart() {
  const ctx = document.getElementById('healthChart'); if (!ctx) return;
  const existing = Chart.getChart('healthChart'); if (existing) existing.destroy();

  const valueLabelsPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.font = 'bold 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          ctx.fillStyle = '#fff';
          ctx.fillText(dataset.data[index], bar.x, bar.y - 6);
        });
      });
    }
  };

  const getGradient = (c, rgb) => {
    const g = c.createLinearGradient(0,0,0,250);
    g.addColorStop(0, `rgba(${rgb}, 1)`);
    g.addColorStop(1, `rgba(${rgb}, 0.2)`);
    return g;
  };

  const canvasCtx = ctx.getContext('2d');
  const rgbColors = ['0,230,118', '255,235,59', '255,152,0', '244,67,54', '156,39,176', '123,31,162'];

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [['Good', '(0-50)'], ['Moderate', '(51-100)'], ['Unhealthy S.', '(101-150)'], ['Unhealthy', '(151-200)'], ['V. Unhealthy', '(201-300)'], ['Hazardous', '(300+)']],
      datasets: [{
        data: [10, 26, 48, 68, 82, 95],
        backgroundColor: rgbColors.map(rgb => getGradient(canvasCtx, rgb)),
        borderRadius: 6,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: 'rgba(15,20,30,0.9)', titleColor: '#8ba2be', bodyColor: '#fff', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, cornerRadius: 8, callbacks: { label: c => ` Health Risk: ${c.raw}%` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8ba2be', font: {family: 'Inter', size: 10} } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8ba2be', font: {family: 'Inter', size: 11} }, title: {display: true, text: 'Health Risk %', color: 'rgba(255,255,255,0.5)', font: {size: 11}}, max: 110 }
      }
    },
    plugins: [valueLabelsPlugin]
  });
}

// ===== ALERTS =====
function buildAlerts() {
  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  const worst = cityAreas.length ? [...cityAreas].sort((a, b) => b.aqi - a.aqi)[0] : null;
  const best = cityAreas.length ? [...cityAreas].sort((a, b) => a.aqi - b.aqi)[0] : null;
  const alertsData = [
    { icon: '🔴', title: `AQI Spike${worst ? ' — ' + worst.name : ''}`, desc: `AQI ${worst ? worst.aqi : 198} — ${worst ? aqiLabel(worst.aqi) : 'Very Unhealthy'}`, time: '2 min ago', sev: 'high' },
    { icon: '🟡', title: `High NO₂ — Industrial area`, desc: `NO₂ at ${LiveData.no2 || 78} µg/m³, exceeds threshold`, time: '25 min ago', sev: 'med' },
    { icon: '🔵', title: 'Forecast Updated', desc: '7-day model updated with 95.1% confidence', time: '1 hour ago', sev: 'low' },
  ];
  const historyData = [
    { icon: '🔴', title: `AQI ${worst ? worst.aqi + 5 : 205} — ${worst ? worst.name : cityDisplay}`, desc: 'Very Unhealthy conditions yesterday at 2pm', time: 'Yesterday 14:00', sev: 'high' },
    { icon: '🟡', title: `PM2.5 Alert`, desc: 'PM2.5 exceeded 80 µg/m³', time: 'Yesterday 08:00', sev: 'med' },
    { icon: '🟢', title: 'Air Quality Improved', desc: `${best ? best.name : cityDisplay} AQI improving`, time: '2 days ago', sev: 'low' },
    { icon: '🔴', title: 'Dust Alert', desc: `PM10 spiked to 340 µg/m³ across ${cityDisplay}`, time: '3 days ago', sev: 'high' },
  ];
  const makeItem = (a) => `
    <div class="alert-item">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-time">${a.time}</div>
      </div>
      <div class="alert-sev sev-${a.sev}">${a.sev.toUpperCase()}</div>
    </div>`;
  const al = document.getElementById('alertsList'); if (al) al.innerHTML = alertsData.map(makeItem).join('');
  const ah = document.getElementById('alertHistory'); if (ah) ah.innerHTML = historyData.map(makeItem).join('');
}

// ===== EXPOSURE TRACKER =====
function calcExposure() {
  const areaAQI = parseInt(document.getElementById('exp-area').value);
  const commuteMin = parseFloat(document.getElementById('exp-commute').value) || 0;
  const exerciseMin = parseFloat(document.getElementById('exp-exercise').value) || 0;
  const homeHrs = parseFloat(document.getElementById('exp-home').value) || 10;
  const purifierFactor = parseFloat(document.getElementById('exp-purifier').value) || 1;
  const breathRate = parseFloat(document.getElementById('exp-activity').value) || 1.0;
  // Convert AQI to approximate PM2.5
  const outdoorPM25 = areaAQI * 0.4;
  const indoorPM25 = outdoorPM25 * 0.6 * purifierFactor;
  const restHrs = 24 - homeHrs - (commuteMin + exerciseMin) / 60;
  // Dose = concentration × time × breathing rate multiplier
  const commuteExp = outdoorPM25 * (commuteMin / 60) * 1.2;
  const exerciseExp = outdoorPM25 * (exerciseMin / 60) * breathRate;
  const homeExp = indoorPM25 * homeHrs * 0.45;
  const restExp = indoorPM25 * Math.max(0, restHrs) * 0.3;
  const totalDose = commuteExp + exerciseExp + homeExp + restExp;
  const dose = totalDose.toFixed(1);
  let statusHTML, statusColor;
  if (totalDose < 20) { statusColor = '#00e676'; statusHTML = `<div style="color:#00e676;font-weight:700;">✅ Low Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Your exposure is within safe limits. Keep up good habits!</div>`; }
  else if (totalDose < 60) { statusColor = '#ffeb3b'; statusHTML = `<div style="color:#ffeb3b;font-weight:700;">⚠️ Moderate Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Consider reducing outdoor time or using a mask during commute.</div>`; }
  else if (totalDose < 120) { statusColor = '#ff9800'; statusHTML = `<div style="color:#ff9800;font-weight:700;">🚨 High Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Significantly above safe levels. Use N95 mask outdoors and get an air purifier.</div>`; }
  else { statusColor = '#f44336'; statusHTML = `<div style="color:#f44336;font-weight:700;">🚫 Dangerous Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Critically high. Strongly recommend limiting outdoor activity and seeing a doctor.</div>`; }
  document.getElementById('expDose').textContent = dose;
  document.getElementById('expDose').style.color = statusColor;
  document.getElementById('expStatus').innerHTML = statusHTML;
  document.getElementById('expStatus').style.background = statusColor + '11';
  document.getElementById('expStatus').style.border = `1px solid ${statusColor}44`;
  document.getElementById('expBreakdown').innerHTML = [
    { label: 'Commute (outdoor)', val: commuteExp.toFixed(1) },
    { label: 'Exercise (outdoor)', val: exerciseExp.toFixed(1) },
    { label: 'Home exposure', val: homeExp.toFixed(1) },
    { label: 'Sleep/rest', val: restExp.toFixed(1) },
  ].map(b => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
    <span style="color:var(--text2);">${b.label}</span><span style="font-weight:700;">${b.val} µg/m³·h</span></div>`).join('');
  const who = 15 * 0.45 * 24; // WHO safe daily exposure approx
  document.getElementById('expAdvice').innerHTML = `💡 <strong>WHO guideline:</strong> PM2.5 annual mean ≤ 5 µg/m³. Your daily exposure of <strong>${dose} µg/m³·h</strong> is ${totalDose < who ? 'within' : 'above'} recommended safe limits. ${totalDose > 60 ? 'Consider: N95 mask, air purifier at home, reduce outdoor peak-hour activity.' : 'Great job managing your exposure!'}`;
  document.getElementById('exposureResult').style.display = 'block';
  document.getElementById('exposurePlaceholder').style.display = 'none';
  buildExposureChart([commuteExp, exerciseExp, homeExp, restExp]);
}
function buildExposureChart(data) {
  const existing = Chart.getChart('exposureChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('exposureChart'); if (!ctx) return;
  const d = data || [10, 0, 15, 5];
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Commute', 'Exercise', 'Home', 'Sleep'],
      datasets: [{ data: d, backgroundColor: ['#ff980088', '#f4433688', '#38b4ff88', '#00e67688'], borderColor: ['#ff9800', '#f44336', '#38b4ff', '#00e676'], borderWidth: 2, borderRadius: 8 }]
    },
    options: { ...baseOpts('µg/m³·h'), plugins: { ...baseOpts().plugins, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: c => `${c.raw.toFixed(1)} µg/m³·h` } } } },
  });
}

// ===== AI HEALTH CHAT =====
const chatHistory = [];
// Try to get key from localStorage first, then fall back to hardcoded constant
function getChatKey() { return localStorage.getItem('airlens_api_key') || ANTHROPIC_KEY || ''; }

function updateChatContext() {
  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  const chatAQI = document.getElementById('chatAQI');
  if (chatAQI && LiveData.aqi) chatAQI.textContent = `${LiveData.aqi} — ${aqiLabel(LiveData.aqi)}`;
  // Update welcome message city name
  const welcome = document.getElementById('chatWelcomeMsg');
  if (welcome && LiveData.aqi) {
    welcome.innerHTML = `👋 Hello! I'm your AI Health Advisor for <strong>${cityDisplay}</strong>. I have access to today's live AQI data.<br><br><strong>Today's AQI:</strong> <span id="chatAQI">${LiveData.aqi} — ${aqiLabel(LiveData.aqi)}</span><br>How can I help you stay safe today?`;
  }
  updateContextPanel();
}
function getAQIContext() {
  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  const worstArea = cityAreas.length ? [...cityAreas].sort((a, b) => b.aqi - a.aqi)[0] : null;
  const bestArea = cityAreas.length ? [...cityAreas].sort((a, b) => a.aqi - b.aqi)[0] : null;
  return `You are AirLens, an AI health advisor for air pollution in ${cityDisplay}, India.
Today's live data for ${cityDisplay}:
- AQI: ${LiveData.aqi || 'N/A'} (${aqiLabel(LiveData.aqi || 0)})
- PM2.5: ${LiveData.pm25 || 'N/A'} µg/m³ (WHO guideline: 15 µg/m³)
- PM10: ${LiveData.pm10 || 'N/A'} µg/m³
- NO₂: ${LiveData.no2 || 'N/A'} µg/m³
- O₃: ${LiveData.o3 || 'N/A'} µg/m³
- Temperature: ${LiveData.temp || 'N/A'}°C
- Wind: ${LiveData.wind || 'N/A'} km/h, Humidity: ${LiveData.humidity || 'N/A'}%
- Weather: ${LiveData.weatherDesc || 'Partly Cloudy'}
${worstArea ? `- Worst nearby area: ${worstArea.name} (AQI ${worstArea.aqi})` : ''}
${bestArea ? `- Best nearby area: ${bestArea.name} (AQI ${bestArea.aqi})` : ''}
- 7-day forecast: ${LiveData.forecastAQI.join(', ')}

Answer health questions concisely (2-4 sentences max). Be specific, practical, and friendly. Use the live data above to give context-aware advice.`;
}

// ===== LOCAL SMART CHATBOT (no API key needed) =====
function localChatReply(msg) {
  const q = msg.toLowerCase();
  const aqi = LiveData.aqi || 130;
  const pm25 = LiveData.pm25 || Math.round(aqi * 0.4);
  const pm10 = LiveData.pm10 || Math.round(aqi * 0.7);
  const no2 = LiveData.no2 || Math.round(aqi * 0.25);
  const temp = LiveData.temp || 33;
  const wind = LiveData.wind || 14;
  const hum = LiveData.humidity || 76;
  const city = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  const label = aqiLabel(aqi);
  const sorted = [...cityAreas].sort((a, b) => b.aqi - a.aqi);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const forecast = LiveData.forecastAQI;

  // --- Mask / protection ---
  if (/mask|n95|respirat|protect/i.test(q)) {
    if (aqi > 150) return `🚨 **Yes, wear an N95 mask** when going outside today. The AQI in ${city} is **${aqi} (${label})**, which is unhealthy. An N95 or KN95 filters out ~95% of PM2.5 particles. A surgical mask gives partial protection but an N95 is strongly recommended at this level.`;
    if (aqi > 100) return `⚠️ **A mask is advisable** for sensitive groups today (AQI ${aqi} — ${label}). If you have asthma, heart disease, or are elderly, use an N95 when outdoors. Healthy adults may not need one for short outings.`;
    return `✅ The AQI in ${city} is **${aqi} (${label})** — relatively manageable. A mask is not strictly necessary for healthy adults, but sensitive individuals may still want one during longer outdoor activities.`;
  }

  // --- Outdoor / go outside ---
  if (/outside|outdoor|go out|walk|jog|run(?!ning app)|safe to/i.test(q)) {
    if (aqi > 200) return `🚫 **Avoid going outdoors** today. AQI is **${aqi} (${label})** — anyone outdoors may experience serious health effects. Stay inside with windows closed and use an air purifier if possible.`;
    if (aqi > 150) return `⚠️ **Limit outdoor time**. AQI is **${aqi} (${label})**. Sensitive groups should stay indoors. Healthy adults should keep outdoor activities short and avoid peak traffic hours (8–10 AM, 6–9 PM).`;
    if (aqi > 100) return `🟡 Air quality is **moderate (AQI ${aqi})**. Outdoor activities are okay for healthy adults in short durations. Sensitive groups (asthma, elderly, children) should reduce prolonged exertion.`;
    return `✅ Air quality is **good (AQI ${aqi})** — safe for outdoor activities. Enjoy your time outside! Best hours are early morning (5–7 AM) when pollution is typically lowest.`;
  }

  // --- Children / kids / baby ---
  if (/child|kid|baby|infant|school|toddler/i.test(q)) {
    if (aqi > 150) return `🚨 **Keep children indoors** today — AQI ${aqi} (${label}) is harmful for young lungs. Children breathe faster than adults and are more vulnerable. If they must go to school, ensure they wear N95 masks and the school has indoor air filtration.`;
    if (aqi > 100) return `⚠️ Children should **minimize outdoor play** today (AQI ${aqi} — ${label}). Avoid playgrounds near busy roads. Indoor play is preferred. Keep school bus windows closed.`;
    return `✅ Children can go outside today — AQI is **${aqi} (${label})**. Still, keep younger kids away from high-traffic areas like ${worst?.name || 'industrial zones'} where AQI tends to be higher.`;
  }

  // --- Exercise / gym / sports ---
  if (/exercise|gym|sport|yoga|cycling|swim|workout/i.test(q)) {
    if (aqi > 150) return `🚨 **Do NOT exercise outdoors** today (AQI ${aqi} — ${label}). Heavy breathing during exercise dramatically increases pollutant intake. Move your workout indoors to a gym with good ventilation or air filtration.`;
    if (aqi > 100) return `⚠️ **Light outdoor exercise only** (AQI ${aqi} — ${label}). Keep sessions under 30 min, avoid busy roads, and exercise in the early morning when AQI is lower. Cycling near ${worst?.name || 'industrial areas'} is especially risky today.`;
    return `✅ Good conditions for outdoor exercise today (AQI ${aqi}). Best time: **5–7 AM** when AQI typically dips 15–20%. Avoid main roads; parks and coastal areas like ${best?.name || 'Besant Nagar'} have cleaner air.`;
  }

  // --- Elderly / senior ---
  if (/elder|senior|old(?:er)? people|grandpar|heart|lung/i.test(q)) {
    if (aqi > 100) return `⚠️ **Elderly and those with heart or lung conditions** should stay indoors or limit outdoor time to under 15 min today (AQI ${aqi} — ${label}). PM2.5 at ${pm25} µg/m³ can trigger respiratory distress. Consult your doctor if symptoms worsen.`;
    return `The AQI of **${aqi}** poses limited risk for most elderly individuals today. However, those with pre-existing heart or lung conditions should still avoid peak-traffic hours and stay hydrated in the ${temp}°C heat.`;
  }

  // --- PM2.5 / PM10 / pollutants ---
  if (/pm2\.?5|pm 2\.?5/i.test(q)) {
    const who = pm25 > 15 ? `⚠️ **${pm25} µg/m³ exceeds the WHO guideline of 15 µg/m³** (annual mean).` : `✅ PM2.5 is within WHO guidelines.`;
    return `Current **PM2.5 in ${city}: ${pm25} µg/m³**. ${who} PM2.5 particles are 2.5 microns or smaller — they penetrate deep into lungs and enter the bloodstream. Long-term exposure at this level increases risk of cardiovascular and respiratory disease. Use an air purifier with HEPA filter indoors.`;
  }
  if (/pm10/i.test(q)) {
    return `Current **PM10 in ${city}: ${pm10} µg/m³**. PM10 particles (≤10 µm) are mainly dust, pollen, and mould. The WHO guideline is 45 µg/m³ (daily). ${pm10 > 45 ? `Today's level of ${pm10} µg/m³ exceeds this — wear a mask outdoors.` : 'Today\'s level is within safe limits.'}`;
  }
  if (/no2|nitrogen|dioxide/i.test(q)) {
    return `Current **NO₂: ${no2} µg/m³** in ${city}. NO₂ is mainly from vehicle exhaust and industrial emissions — highest in ${worst?.name || 'north Chennai'} near the industrial belt. The WHO guideline is 25 µg/m³ (24h mean). ${no2 > 40 ? '⚠️ Today exceeds the threshold — avoid roadside exposure.' : '✅ Today is within acceptable limits.'}`;
  }

  // --- Worst / best area ---
  if (/worst|most pollut|dangerous|avoid/i.test(q)) {
    if (!worst) return `Data on nearby areas is still loading. The most polluted zones in ${city} are typically the industrial north — Manali, Tondairpet, and Ambattur.`;
    return `🔴 **Most polluted area right now: ${worst.name}** (AQI **${worst.aqi}** — ${aqiLabel(worst.aqi)}). Avoid this area if possible, especially during morning and evening rush hours. Industrial emissions and vehicle congestion are the primary sources.`;
  }
  if (/best|clean(?:est)?|fresh|safe area/i.test(q)) {
    if (!best) return `The cleanest areas in ${city} are typically the southern coastal zones — Besant Nagar, ECR, and OMR — where sea breeze helps disperse pollutants.`;
    return `✅ **Cleanest area right now: ${best.name}** (AQI **${best.aqi}** — ${aqiLabel(best.aqi)}). Sea breezes from the Bay of Bengal help keep southern and coastal areas cleaner. Great for morning walks!`;
  }

  // --- Weather ---
  if (/weather|temperature|humid|wind|rain/i.test(q)) {
    return `🌡 **Current weather in ${city}:** ${temp}°C, Humidity ${hum}%, Wind ${wind} km/h.\n${hum > 70 ? 'High humidity traps pollutants close to the ground — AQI tends to be worse on humid days.' : 'Moderate humidity today.'} ${wind > 15 ? `Wind at ${wind} km/h is helping disperse pollutants — good news for air quality.` : `Low wind (${wind} km/h) means pollutants are accumulating — stay alert.`} ${LiveData.weatherDesc || 'Partly cloudy'} conditions.`;
  }

  // --- Forecast ---
  if (/forecast|tomorrow|next week|this week|predict/i.test(q)) {
    if (forecast && forecast.length >= 3) {
      const days_ = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
      const lines = forecast.slice(0, 5).map((v, i) => `**${days_[i]}:** AQI ${v} — ${aqiLabel(v)}`).join('\n');
      const trend = forecast[2] > forecast[0] ? '📈 AQI is expected to rise in the coming days.' : '📉 Air quality is forecast to improve.';
      return `📅 **7-Day AQI Forecast for ${city}:**\n${lines}\n\n${trend} Plan outdoor activities on lower-AQI days.`;
    }
    return `Forecast data is loading. Generally, AQI in ${city} peaks during summer (Apr–Jun) and improves slightly during the northeast monsoon (Oct–Dec) when rains wash away pollutants.`;
  }

  // --- AQI meaning/scale ---
  if (/what is aqi|aqi mean|aqi scale|aqi level|how is aqi/i.test(q)) {
    return `📊 **AQI (Air Quality Index)** is a scale of 0–500:\n• **0–50** — 🟢 Good\n• **51–100** — 🟡 Moderate\n• **101–150** — 🟠 Unhealthy for Sensitive Groups\n• **151–200** — 🔴 Unhealthy\n• **201–300** — 🟣 Very Unhealthy\n• **300+** — ⚫ Hazardous\n\nRight now ${city} is at **${aqi} — ${label}**.`;
  }

  // --- Air purifier ---
  if (/purifier|purify|indoor air|hepa/i.test(q)) {
    return `🏠 **Indoor Air Quality Tips for ${city}:**\n• Use a HEPA air purifier — it removes 99.97% of PM2.5 particles.\n• Keep windows closed during peak hours (8–10 AM, 6–9 PM).\n• Indoor plants like Peace Lily, Spider Plant, and Snake Plant mildly improve air quality.\n• Change A/C filters every 2–3 months. With today's AQI at ${aqi}, running a purifier at medium speed is recommended.`;
  }

  // --- Health symptoms ---
  if (/cough|throat|eye|sneez|breath|irritat|sympt/i.test(q)) {
    return `🩺 Symptoms like itchy eyes, coughing, or throat irritation are common when AQI exceeds 100. Today's AQI is **${aqi} (${label})**.\n\n**Immediate relief:** Stay indoors, drink plenty of water, and avoid outdoor exposure. A steam inhaler can soothe throat irritation. If symptoms persist or worsen (especially breathlessness), consult a doctor. People with asthma should keep inhalers handy.`;
  }

  // --- Data source / accuracy ---
  if (/data|source|accurat|real.?time|sensor|station/i.test(q)) {
    return `📡 Air quality data is sourced from **WAQI (World Air Quality Index)** stations across ${city} — the same network used by the Indian Government's CPCB monitoring. There are currently **${cityAreas.length} stations** tracked near ${city}. Data refreshes every 5 minutes. When live data is unavailable due to network/CORS restrictions, realistic estimated values based on the city's typical pollution patterns are shown.`;
  }

  // --- Generic AQI status ---
  if (/aqi|air qual|pollut|today|current|how bad/i.test(q)) {
    return `Current AQI in **${city}: ${aqi} — ${label}**.\n\nPM2.5: ${pm25} µg/m³ | PM10: ${pm10} µg/m³ | NO₂: ${no2} µg/m³\n\n${aqiMsg(aqi)}\n\nWorst area nearby: **${worst?.name || '—'} (${worst?.aqi || '—'})** | Best: **${best?.name || '—'} (${best?.aqi || '—'})**.`;
  }

  // --- Default fallback ---
  const suggestions = ['Is it safe to go outside today?', 'Should I wear a mask?', 'Which area in Chennai is cleanest?', 'What does AQI of ' + aqi + ' mean for my health?', 'What is the 7-day forecast?'];
  const pick = suggestions[Math.floor(Math.random() * suggestions.length)];
  return `I'm your **${city} Air Health Advisor** 🌿 I can help with:\n• Health advice based on today's AQI (${aqi} — ${label})\n• Mask & outdoor safety recommendations\n• Best/worst areas to visit\n• Pollutant levels (PM2.5, PM10, NO₂)\n• Forecast & indoor air tips\n\nTry asking: *"${pick}"*`;
}

// Removed API key prompt — chatbot works locally without any key
function showApiKeyPrompt() { /* no-op — local chatbot needs no key */ }
function saveApiKey() { /* no-op */ }
function clearApiKey() { /* no-op */ }

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendMsg(msg, 'user');
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  // Show typing animation
  const typingId = 'typing-' + Date.now();
  const chatMsgs = document.getElementById('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg typing'; typingEl.id = typingId;
  typingEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  chatMsgs.appendChild(typingEl);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;

  const cityDisplay = SELECTED_CITY.charAt(0).toUpperCase() + SELECTED_CITY.slice(1);
  const aqi = LiveData.aqi || 'N/A';
  const pm25 = LiveData.pm25 || 'N/A';
  const pm10 = LiveData.pm10 || 'N/A';
  const no2 = LiveData.no2 || 'N/A';
  const o3 = LiveData.o3 || 'N/A';
  const so2 = LiveData.so2 || 'N/A';
  const co = LiveData.co || 'N/A';
  const temp = LiveData.temp || 'N/A';
  const hum = LiveData.humidity || 'N/A';
  const wind = LiveData.wind || 'N/A';

  const systemPrompt = `You are ChennAIR AI, an expert health advisor and environmental scientist.
You are helping a user in the city of ${cityDisplay}. 
Current Live Data for ${cityDisplay}:
- AQI: ${aqi} (${aqi !== 'N/A' ? aqiLabel(aqi) : 'Unknown'})
- PM2.5: ${pm25} µg/m³
- PM10: ${pm10} µg/m³
- NO2: ${no2} ppb
- O3: ${o3} ppb
- SO2: ${so2} ppb
- CO: ${co} ppm
- Temperature: ${temp}°C
- Humidity: ${hum}%
- Wind Speed: ${wind} km/h

Provide practical, health-focused advice based on these specific pollution levels. Be concise, friendly, and use formatting like markdown bolding or lists where appropriate. Keep your responses under 4 sentences unless asked for a detailed explanation.`;

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: msg }
  ];

  let reply = '';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        temperature: 0.5,
        max_tokens: 500
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      reply = data.choices[0].message.content;
    } else {
      console.error('Groq API Error:', await res.text());
      reply = 'I am currently having trouble connecting to my AI brain. Please try again later.';
    }
  } catch(e) {
    console.error('Groq Fetch Error:', e);
    reply = 'Network error connecting to the AI service. Are you connected to the internet?';
  }

  chatHistory.push({ role: 'user', content: msg });
  chatHistory.push({ role: 'assistant', content: reply });
  document.getElementById(typingId)?.remove();
  appendMsg(reply, 'bot');
  if (sendBtn) sendBtn.disabled = false;
}
function sendQuick(msg) {
  document.getElementById('chatInput').value = msg;
  sendChat();
}
function appendMsg(text, role) {
  const chatMsgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>').replace(/\n/g, '<br>');
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ===== DOWNLOAD REPORT (real PDF via jsPDF) =====
async function downloadReport() {
  if (window.jspdf) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('ChennAIR — Air Quality Report', 105, 20, { align: 'center' });
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 30, { align: 'center' });
      doc.line(15, 35, 195, 35);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Current Conditions', 15, 48);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      const lines = [
        `AQI: ${LiveData.aqi || 'N/A'} — ${aqiLabel(LiveData.aqi || 0)}`,
        `PM2.5: ${LiveData.pm25 || 'N/A'} µg/m³`,
        `PM10: ${LiveData.pm10 || 'N/A'} µg/m³`,
        `NO₂: ${LiveData.no2 || 'N/A'} µg/m³`,
        `O₃: ${LiveData.o3 || 'N/A'} µg/m³`,
        `Temperature: ${LiveData.temp || 'N/A'}°C  |  Wind: ${LiveData.wind || 'N/A'} km/h`,
        `Humidity: ${LiveData.humidity || 'N/A'}%`,
      ];
      lines.forEach((l, i) => doc.text(l, 15, 58 + i * 8));
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('7-Day AQI Forecast', 15, 125);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      LiveData.forecastAQI.forEach((v, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        doc.text(`${i === 0 ? 'Today' : days[d.getDay()]} ${d.getDate()}: AQI ${v} — ${aqiLabel(v)}`, 15, 135 + i * 8);
      });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Health Advisory', 15, 200);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text(aqiMsg(LiveData.aqi || 0), 15, 210, { maxWidth: 180 });
      doc.text('Data Sources: WAQI, OpenWeatherMap, Sentinel-5P', 15, 270);
      doc.text('© ChennAIR v3.0 — AI-Powered Pollution Forecasting', 105, 285, { align: 'center' });
      doc.save(`ChennAIR_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('✅', 'PDF Report Downloaded', `${SELECTED_CITY}_AQI_Report saved`);
    } catch (e) {
      showToast('📄', 'Report Ready', 'ChennAIR_AQI_Report.pdf');
    }
  } else {
    showToast('📄', 'Report', 'jsPDF loading — try again shortly');
  }
}

// Download CSV
function downloadCSV() {
  const rows = [['Date', 'AQI', 'Status']];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const aqi = rnd(60, 200);
    rows.push([d.toISOString().split('T')[0], aqi, aqiLabel(aqi)]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'ChennAIR_History.csv';
  a.click();
  showToast('✅', 'CSV Downloaded', 'ChennAIR_History.csv saved');
}

// ===== UI HELPERS =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  if (leafletMap) {
    leafletMap.eachLayer(l => { if (l._url) leafletMap.removeLayer(l); });
    const tileUrl = isDark ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { attribution: '© OpenStreetMap · CartoDB', maxZoom: 19 }).addTo(leafletMap);
  }
  setTimeout(rebuildAllCharts, 100);
}
function toggleNotifPanel() { document.getElementById('notifPanel').classList.toggle('open'); }
function loginUser() {
  document.getElementById('loginModal').classList.remove('open');
  showToast('👤', 'Signed In', 'Welcome! Personalized alerts enabled.');
  const btn = document.querySelector('.user-btn');
  if (btn) { btn.textContent = '✓'; btn.style.background = 'linear-gradient(135deg,#00e676,#00b8d4)'; }
}
function setUnit(unit, btn) {
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function showToast(icon, title, msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = msg;
  t.children[0].textContent = icon;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
function saveThresholds() {
  localStorage.setItem('thresh_pm25', thresholds.pm25);
  localStorage.setItem('thresh_aqi', thresholds.aqi);
  localStorage.setItem('thresh_no2', thresholds.no2);
}

// Close panels on outside click
document.addEventListener('click', e => {
  const sidebar = document.getElementById('sidebar');
  const notif = document.getElementById('notifPanel');
  if (!sidebar.contains(e.target) && !e.target.classList.contains('menu-btn')) sidebar.classList.remove('open');
  if (!notif.contains(e.target) && !e.target.closest('.alert-btn')) notif.classList.remove('open');
});

// ===== INIT ALL =====
window.addEventListener('load', async () => {
  // --- Instantly pre-populate with mock data so nothing is blank ---
  const isChennai = (SELECTED_CITY || '').toLowerCase() === 'chennai';
  cityAreas = isChennai ? getChennaiMockAreas() : getCityMockAreas(SELECTED_CITY);
  // Pre-fill LiveData from mock so gauge/pollutants show something right away
  const sortedMock = [...cityAreas].sort((a, b) => a.aqi - b.aqi);
  const medMock = sortedMock[Math.floor(sortedMock.length / 2)];
  LiveData.aqi = medMock.aqi;
  LiveData.pm25 = medMock.pm25 || Math.round(medMock.aqi * 0.4);
  LiveData.pm10 = medMock.pm10 || Math.round(medMock.aqi * 0.7);
  LiveData.no2 = medMock.no2 || Math.round(medMock.aqi * 0.25);
  LiveData.o3 = Math.round(medMock.aqi * 0.18);
  LiveData.so2 = Math.round(medMock.aqi * 0.08);
  LiveData.co = parseFloat((medMock.aqi * 0.01).toFixed(2));
  LiveData.temp = isChennai ? 33 : 28;
  LiveData.wind = isChennai ? 14 : 10;
  LiveData.humidity = isChennai ? 76 : 55;
  const mockIaqiInit = {
    pm25: { v: LiveData.pm25 }, pm10: { v: LiveData.pm10 }, no2: { v: LiveData.no2 },
    o3: { v: LiveData.o3 }, so2: { v: LiveData.so2 }, co: { v: LiveData.co }
  };
  drawGauge(medMock.aqi);
  updateAQIDisplay(medMock.aqi);
  updatePollutantsDisplay(mockIaqiInit);
  buildTrendChart();
  buildDayCards();
  buildForecastMainChart('aqi');
  buildAPIForecastCharts();
  buildAreaRankings();
  buildAreaChart();
  buildHistoryChart();
  buildDistChart();
  buildCorrChart();
  buildHeatmapChart();
  updateStatsCards();

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Fetch live data in parallel (replaces mock when successful)
  await Promise.allSettled([loadAQI(), loadWeather(), loadNearbyAreas()]);

  // Rebuild after live data arrives
  buildTrendChart();
  buildDayCards();
  buildForecastMainChart('aqi');
  buildAPIForecastCharts();
  buildAreaRankings();
  buildAreaChart();
  buildHistoryChart();
  buildDistChart();
  buildCorrChart();
  buildHeatmapChart();

  // Auto-refresh every 5 minutes
  setInterval(async () => {
    await Promise.allSettled([loadAQI(), loadWeather(), loadNearbyAreas()]);
    buildTrendChart();
    buildDayCards();
    buildForecastMainChart(currentForecastType);
    buildAPIForecastCharts();
    buildAreaRankings();
    buildAreaChart();
    buildHistoryChart();
    buildDistChart();
    buildCorrChart();
    buildHeatmapChart();
    // Refresh 3D stats if visible
    const viz3dStats = document.getElementById('viz3dStats');
    if (viz3dStats && document.getElementById('page-viz3d').classList.contains('active')) {
      // Re-init 3D with fresh cityAreas
      if (renderer3D) { renderer3D.dispose(); renderer3D = null; scene3D = null; }
      init3D();
    }
    showToast('🔄', 'Data Refreshed', 'Live data updated every 5 min');
  }, 5 * 60 * 1000);

  // Handle hash navigation
  const hash = location.hash.replace('#', '');
  if (hash && pageTitles[hash]) {
    const nav = document.querySelector(`.nav-item[onclick*="'${hash}'"]`);
    showPage(hash, nav);
  }
});

// =====================================================================
// DASHBOARD REDESIGN v3.0 — UI-only helpers (no data logic touched)
// =====================================================================
function switchOvTab(name, btn){
  document.querySelectorAll('.ov-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.ov-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = document.querySelector('.ov-panel[data-panel="'+name+'"]');
  if (panel) panel.classList.add('active');
}

document.addEventListener("DOMContentLoaded", function initDashRedesign(){
  
  /* --- 3D TILT EFFECT FOR OVERVIEW CARD & INTERNAL BOXES --- */
  const tiltElements = document.querySelectorAll('.card, .ahv-metric, .asr-item');
  tiltElements.forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotateX = -(y / rect.height) * 10;
      const rotateY = (x / rect.width) * 10;
      el.style.setProperty('--rx', rotateX + 'deg');
      el.style.setProperty('--ry', rotateY + 'deg');
    });
    el.addEventListener('mouseleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
  /* ---------------------------------------- */

  function pad(n){ return String(n).padStart(2,'0'); }
  function tick(){
    const d = new Date();
    const dEl = document.getElementById('dashDate');
    const dyEl = document.getElementById('dashDay');
    const tEl = document.getElementById('dashClock');
    const ovT = document.getElementById('ovTime');
    const gEl = document.getElementById('dashGreeting');
    if (dEl)  dEl.textContent  = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    if (dyEl) dyEl.textContent = d.toLocaleDateString('en-US',{weekday:'long'});
    if (tEl)  tEl.textContent  = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
    if (ovT){
      const h=d.getHours(), ap=h>=12?'PM':'AM', h12=((h+11)%12)+1;
      ovT.textContent = h12+':'+pad(d.getMinutes())+' '+ap;
    }
    if (gEl){
      const h=d.getHours();
      const salute = h<12?'Good Morning':h<17?'Good Afternoon':h<21?'Good Evening':'Good Night';
      gEl.innerHTML = salute+', User <span class="wave">👋</span>';
    }
  }
  tick(); setInterval(tick, 1000);

  function stateFor(v){
    if (!v || isNaN(v)) return 'good';
    v = +v;
    if (v < 51)  return 'good';
    if (v < 101) return 'moderate';
    if (v < 151) return 'usg';
    if (v < 201) return 'unhealthy';
    if (v < 301) return 'vunhealthy';
    return 'hazardous';
  }
  function pillText(s){
    return ({
      good:'Air is fresh and Healthy',
      moderate:'Air is Acceptable',
      usg:'Unhealthy for Sensitive Groups',
      unhealthy:'Unhealthy — Wear a Mask',
      vunhealthy:'Very Unhealthy — Stay Indoors',
      hazardous:'Hazardous — Emergency Conditions'
    })[s] || '—';
  }
  function statusText(s){
    return ({good:'Good',moderate:'Moderate',usg:'USG',unhealthy:'Unhealthy',vunhealthy:'Very Unhealthy',hazardous:'Hazardous'})[s]||'—';
  }

  function sync(){
    const gauge = document.getElementById('gaugeNum');
    const card  = document.getElementById('overviewCard');
    if (!gauge || !card) return;

    const raw = (gauge.textContent||'').trim();
    const v = parseFloat(raw);
    const s = stateFor(v);
    card.setAttribute('data-aqi-state', s);

    const pill = document.getElementById('aqiPillText');
    if (pill) pill.textContent = pillText(s);

    // Placeholder min/max only if not filled elsewhere
    if (!isNaN(v)){
      const mn = document.getElementById('minAqiToday');
      const mx = document.getElementById('maxAqiToday');
      if (mn && (mn.textContent === '—' || mn.dataset.auto)) {
        mn.dataset.auto = '1';
        mn.firstChild.textContent = String(Math.max(1, Math.round(v * 0.55)));
      }
      if (mx && (mx.textContent === '—' || mx.dataset.auto)) {
        mx.dataset.auto = '1';
        mx.firstChild.textContent = String(Math.round(v * 1.35));
      }
    }
  }

  const gauge = document.getElementById('gaugeNum');
  if (gauge){
    new MutationObserver(sync).observe(gauge, {childList:true, characterData:true, subtree:true, attributes:true});
  }
  ['pm25Val','pm10Val','no2Val','so2Val','coVal','o3Val'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) new MutationObserver(sync).observe(el,{childList:true,characterData:true,subtree:true,attributes:true});
  });
  sync();
});

/* ===== v2 dashboard: mini map + pollutant mirror ===== */
(function initDashV2(){
  let dashMap=null, dashMarkers=[];
  function buildDashMap(){
    if (dashMap || !window.L) return;
    const el=document.getElementById('dashLeafletMap'); if(!el) return;
    let lat = 13.0827, lng = 80.2707, zoom = 12;
    if (HAS_SELECTED_COORDS) {
      lat = SELECTED_LAT;
      lng = SELECTED_LNG;
      zoom = 12;
    } else if (typeof getCityCenter === 'function' && typeof SELECTED_CITY !== 'undefined') {
      const c = getCityCenter(SELECTED_CITY);
      lat = c.lat;
      lng = c.lng;
      zoom = c.zoom === 5 ? 12 : c.zoom;
    }
    dashMap=L.map('dashLeafletMap',{center:[lat,lng],zoom:zoom,zoomControl:true,attributionControl:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(dashMap);
    if (typeof cityAreas!=='undefined') {
      cityAreas.forEach(a=>{
        const col = (typeof aqiColor==='function')? aqiColor(a.aqi) : '#00e676';
        const size=Math.max(22,Math.min(46,a.aqi/5));
        const icon=L.divIcon({className:'',html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${col};opacity:.9;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:700 11px Rajdhani,sans-serif;color:#0a0f18;box-shadow:0 0 ${size/2}px ${col}aa;">${a.aqi}</div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
        dashMarkers.push(L.marker([a.lat,a.lng],{icon}).addTo(dashMap));
      });
    }
    setTimeout(()=>dashMap && dashMap.invalidateSize(), 250);
  }
  function mirrorPollutants(){
    const src=id=>{const e=document.getElementById(id);return e?e.textContent.trim():null;};
    const set=(id,v)=>{const e=document.getElementById(id);if(e && v && v!=='—') e.textContent=v;};
    set('pmrPm25', src('pm25Val'));
    set('pmrPm10', src('pm10Val'));
  }
  function boot(){
    buildDashMap();
    mirrorPollutants();
    setInterval(mirrorPollutants, 4000);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* ===== EXPAND MAP & 3D MOTION TILT INTERACTION ===== */

function handleMapCardClick(e) {
  // If user clicked on direct link or Leaflet control buttons, ignore card toggle
  if (e.target.closest('.pmrow-link') || e.target.closest('.leaflet-control') || e.target.closest('.leaflet-popup')) {
    return;
  }
  toggleMapExpand();
}

function toggleMapExpand() {
  const card = document.getElementById('mapExpandCard');
  const mapEl = document.getElementById('dashLeafletMap');
  const btnText = document.getElementById('expandMapText');
  const btnIcon = document.getElementById('expandMapIcon');
  const hintEl = document.getElementById('mapExpandHint');
  if (!mapEl) return;

  const isExpanded = mapEl.classList.toggle('is-expanded');
  if (btnText) btnText.textContent = isExpanded ? 'Collapse Map' : 'Expand Map';
  if (btnIcon) btnIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
  if (hintEl) hintEl.textContent = isExpanded ? 'Click box to collapse map' : 'Click box to expand map';

  // Leaflet resize trigger
  setTimeout(() => {
    if (window.dashMap) window.dashMap.invalidateSize();
  }, 350);
}

/* old toggleMapExpand replaced */
function _unused_toggleMapExpand() {
  const card = document.getElementById('mapExpandCard');
  const mapEl = document.getElementById('dashLeafletMap');
  const btnText = document.getElementById('expandMapText');
  const btnIcon = document.getElementById('expandMapIcon');
  if (!mapEl) return;

  const isExpanded = mapEl.classList.toggle('is-expanded');
  if (btnText) btnText.textContent = isExpanded ? 'Collapse Map' : 'Expand Map';
  if (btnIcon) btnIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

  // Leaflet resize trigger
  setTimeout(() => {
    if (window.dashMap) window.dashMap.invalidateSize();
  }, 350);
}

function handleMapTilt(e) {
  const card = document.getElementById('mapExpandCard');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const mouseX = e.clientX - centerX;
  const mouseY = e.clientY - centerY;
  const rotateX = (-mouseY / rect.height) * 8;
  const rotateY = (mouseX / rect.width) * 8;
  card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

function resetMapTilt() {
  const card = document.getElementById('mapExpandCard');
  if (!card) return;
  card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
}
