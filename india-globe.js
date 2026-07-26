/* ════════════════════════════════════════════════════════════════════
   INDIA GLOBE — 3D drill-down map module
   ──────────────────────────────────────────────────────────────────────
   Phase 1: World → India (states extruded, AQI-colored)
   Phase 2: State → districts extruded on flat 3D floating map
   Phase 3: District → cities as glowing 3D pins
   Phase 4: GPS auto-drill-down
   ──────────────────────────────────────────────────────────────────────
   Depends on: THREE (r128) loaded globally
   Data: jsDelivr CDN of udit-001/india-maps-data
   ════════════════════════════════════════════════════════════════════ */

(function () {
  if (typeof window === 'undefined' || !window.THREE) return;

  // ───── CONFIG ─────────────────────────────────────────────────
  const GEO_BASE = 'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@ef25ebc/geojson';
  const INDIA_URL = `${GEO_BASE}/india.geojson`;
  const STATE_URL = (slug) => `${GEO_BASE}/states/${slug}.geojson`;

  // Bounding box roughly for India (for camera framing)
  const INDIA_CENTER = { lat: 22.0, lng: 79.0 };

  const AQI_COLORS = {
    good:       0x00e676, // Bright Green 0-50
    lime:       0x8bc34a, // Lime 50-100
    moderate:   0xffeb3b, // Yellow 100-135
    amber:      0xffc107, // Amber 135-170
    sensitive:  0xff9800, // Orange 170-210
    unhealthy:  0xff5722, // Deep Orange 210-250
    hazardous:  0xf44336, // Red 250+
    neutral:    0x2a4563
  };
  function aqiColor(v) {
    if (v == null || isNaN(v)) return AQI_COLORS.neutral;
    if (v <= 50) return AQI_COLORS.good;
    if (v <= 100) return AQI_COLORS.lime;
    if (v <= 135) return AQI_COLORS.moderate;
    if (v <= 170) return AQI_COLORS.amber;
    if (v <= 210) return AQI_COLORS.sensitive;
    if (v <= 250) return AQI_COLORS.unhealthy;
    return AQI_COLORS.hazardous;
  }

  // ───── NAME NORMALIZATION ─────────────────────────────────────
  // The GeoJSON data uses various naming conventions. Normalize for matching.
  function normalizeName(s) {
    if (!s) return '';
    return s.toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '');
  }
  function stateSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  // ───── GEOJSON CACHE ──────────────────────────────────────────
  const geoCache = new Map();
  async function loadGeo(url) {
    if (geoCache.has(url)) return geoCache.get(url);
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error('Failed to load ' + url);
      return r.json();
    });
    geoCache.set(url, p);
    try { return await p; } catch (e) { geoCache.delete(url); throw e; }
  }

  // ───── COORDINATE HELPERS ─────────────────────────────────────
  // Map (lon, lat) → 3D point on sphere of radius R
  function latLngToVec3(lat, lng, R) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -R * Math.sin(phi) * Math.cos(theta),
       R * Math.cos(phi),
       R * Math.sin(phi) * Math.sin(theta)
    );
  }

  // Map (lon, lat) → 2D plane point (for flat state/district maps)
  // Uses simple equirectangular projection centered on the feature.
  function latLngToPlane(lat, lng, center, scale) {
    return [
      (lng - center.lng) * scale,
      (lat - center.lat) * scale
    ];
  }

  // Compute bounding box of a GeoJSON polygon/multipolygon
  function featureBounds(feature) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    const walkRing = (ring) => {
      for (const [lng, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    };
    const geom = feature.geometry;
    if (geom.type === 'Polygon') geom.coordinates.forEach(walkRing);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(walkRing));
    return {
      minLat, maxLat, minLng, maxLng,
      centerLat: (minLat + maxLat) / 2,
      centerLng: (minLng + maxLng) / 2,
      spanLat: maxLat - minLat,
      spanLng: maxLng - minLng
    };
  }

  // ───── TWEEN (minimal, since we don't load a tween lib) ───────
  const tweens = [];
  function tween(obj, to, duration = 1200, easing = easeInOutCubic, onComplete) {
    const from = {};
    for (const k of Object.keys(to)) from[k] = obj[k];
    const start = performance.now();
    const t = {
      obj, from, to, duration, easing, onComplete,
      startTime: start, done: false
    };
    tweens.push(t);
    return t;
  }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function updateTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const elapsed = now - t.startTime;
      const p = Math.min(1, elapsed / t.duration);
      const eased = t.easing(p);
      for (const k of Object.keys(t.to)) {
        t.obj[k] = t.from[k] + (t.to[k] - t.from[k]) * eased;
      }
      if (p >= 1) {
        tweens.splice(i, 1);
        if (t.onComplete) t.onComplete();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ──── MAIN CLASS ───────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════
  class IndiaGlobe {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputEncoding = THREE.sRGBEncoding;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      this.camera.position.set(0, 0, 8);
      this.cameraTarget = new THREE.Vector3(0, 0, 0);

      // Lighting
      this.scene.add(new THREE.AmbientLight(0x6688aa, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 1.0);
      sun.position.set(5, 8, 6);
      this.scene.add(sun);
      const fill = new THREE.DirectionalLight(0x4aa3ff, 0.3);
      fill.position.set(-5, -2, -3);
      this.scene.add(fill);

      // Root groups — one per view mode (only one visible at a time)
      this.worldGroup = new THREE.Group();   // Earth + atmosphere
      this.indiaGroup = new THREE.Group();   // Extruded states floating above India's surface
      this.stateGroup = new THREE.Group();   // Flat 3D map of a state with districts
      this.districtGroup = new THREE.Group(); // Flat 3D map of a district with city pins
      this.scene.add(this.worldGroup, this.indiaGroup, this.stateGroup, this.districtGroup);
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;

      // State
      this.mode = 'world';         // 'world' | 'india' | 'state' | 'district'
      this.currentStateName = null;
      this.currentDistrictName = null;
      this.stateMeshes = new Map();    // state name -> { mesh, originalColor }
      this.districtMeshes = new Map(); // district name -> { mesh, originalColor }
      this.cityPins = [];
      this.aqiData = { states: {}, districts: {}, cities: [] };

      // Build the world (Earth) — same NASA PBR material approach as original
      this._buildEarth();

      // Events
      window.addEventListener('resize', () => this._onResize());

      // Mouse parallax for world view
      this.mouseX = 0; this.mouseY = 0;
      window.addEventListener('mousemove', e => {
        this.mouseX = (e.clientX / window.innerWidth - 0.5) * 0.3;
        this.mouseY = (e.clientY / window.innerHeight - 0.5) * 0.2;
      });

      // ═══════════════════════════════════════════════════════
      // SKETCHFAB/GOOGLE-EARTH-STYLE ORBIT CONTROLS
      //
      // Critical: attach drag listeners to WINDOW, not the canvas.
      // The canvas sits behind screen overlays (hero/picker) with
      // z-index 10, so mouse events never reach the canvas directly.
      // By listening on window and filtering out clicks on interactive
      // UI elements, we get drag-to-rotate working regardless of CSS.
      // ═══════════════════════════════════════════════════════
      this._drag = { active: false, startX: 0, startY: 0 };
      this._userRotation = { x: 0, y: 0 }; // user-applied rotation delta
      this._cameraDistance = 5.5;          // managed by scroll

      const getActiveGroup = () => {
        if (this.mode === 'district') return this.districtGroup;
        if (this.mode === 'state') return this.stateGroup;
        if (this.mode === 'india' || this.mode === 'flying') return this.indiaGroup;
        if (this.mode === 'world') return this.worldGroup;  // Earth is draggable too
        return null;
      };

      // Returns true if the click target is on a real UI element that
      // should capture clicks (dropdowns, buttons, form inputs, labels).
      // Everything else (empty screen space, overlays, canvas) counts as
      // rotate-the-globe area.
      const isUIClick = (target) => {
        if (!target) return false;
        // Walk up the DOM tree checking for interactive ancestors
        let el = target;
        while (el && el !== document.body) {
          const tag = el.tagName;
          if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
              tag === 'TEXTAREA' || tag === 'A' || tag === 'LABEL') {
            return true;
          }
          if (el.classList) {
            if (el.classList.contains('sel-wrap') ||
                el.classList.contains('sel-dropdown') ||
                el.classList.contains('sel-option') ||
                el.classList.contains('sel-search') ||
                el.classList.contains('sel-display') ||
                el.classList.contains('btn') ||
                el.classList.contains('proceed-btn') ||
                el.classList.contains('aqi-preview') ||
                el.classList.contains('aqi-legend') ||
                el.classList.contains('controls-hint')) {
              return true;
            }
          }
          el = el.parentElement;
        }
        return false;
      };

      // --- Mouse drag (anywhere on the page, except UI elements) ---
      window.addEventListener('mousedown', e => {
        if (isUIClick(e.target)) return;
        if (e.button !== 0) return;  // Left button only
        this._drag.active = true;
        this._drag.startX = e.clientX;
        this._drag.startY = e.clientY;
        if (this.mode === 'world') this._userRotatingWorld = true;
        document.body.style.cursor = 'grabbing';
      });
      window.addEventListener('mouseup', () => {
        if (!this._drag.active) return;
        this._drag.active = false;
        document.body.style.cursor = '';
      });
      window.addEventListener('mousemove', e => {
        if (!this._drag.active) return;
        const dx = e.clientX - this._drag.startX;
        const dy = e.clientY - this._drag.startY;
        const g = getActiveGroup();
        if (g) {
          g.rotation.y += dx * 0.006;
          g.rotation.x += dy * 0.006;
          if (this.mode !== 'world') {
            // Clamp for flat maps only; earth spins freely
            const maxX = Math.PI / 2 - 0.1;
            g.rotation.x = Math.max(-maxX, Math.min(maxX, g.rotation.x));
          }
        }
        this._drag.startX = e.clientX;
        this._drag.startY = e.clientY;
      });

      // Scroll-to-zoom (also on window; ignore wheel over UI containers)
      window.addEventListener('wheel', e => {
        if (isUIClick(e.target)) return;
        e.preventDefault();
        const delta = e.deltaY * 0.003;
        if (this.mode === 'world') {
          this.camera.position.z = Math.max(4, Math.min(14, this.camera.position.z + delta * 2));
        } else {
          this._cameraDistance = Math.max(2.5, Math.min(16, this._cameraDistance + delta * 1.5));
          this.camera.position.z = this._cameraDistance;
        }
      }, { passive: false });

      // --- Touch (mobile) ---
      window.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        if (isUIClick(e.target)) return;
        this._drag.active = true;
        this._drag.startX = e.touches[0].clientX;
        this._drag.startY = e.touches[0].clientY;
        if (this.mode === 'world') this._userRotatingWorld = true;
      }, { passive: true });
      window.addEventListener('touchend', () => {
        this._drag.active = false;
      });
      window.addEventListener('touchmove', e => {
        if (!this._drag.active || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - this._drag.startX;
        const dy = e.touches[0].clientY - this._drag.startY;
        const g = getActiveGroup();
        if (g) {
          g.rotation.y += dx * 0.006;
          g.rotation.x += dy * 0.006;
          if (this.mode !== 'world') {
            const maxX = Math.PI / 2 - 0.1;
            g.rotation.x = Math.max(-maxX, Math.min(maxX, g.rotation.x));
          }
          e.preventDefault();
        }
        this._drag.startX = e.touches[0].clientX;
        this._drag.startY = e.touches[0].clientY;
      }, { passive: false });

      // Start render loop
      this.clock = new THREE.Clock();
      this._animate();
    }

    _onResize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ─── BUILD REALISTIC EARTH (same textures as before) ─────────
    _buildEarth() {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      const TEX_BASE = 'https://unpkg.com/three-globe/example/img/';

      const dayTex = loader.load(TEX_BASE + 'earth-blue-marble.jpg');
      const bumpTex = loader.load(TEX_BASE + 'earth-topology.png');
      const specTex = loader.load(TEX_BASE + 'earth-water.png');
      const nightTex = loader.load(TEX_BASE + 'earth-night.jpg');
      dayTex.encoding = THREE.sRGBEncoding;
      nightTex.encoding = THREE.sRGBEncoding;

      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      [dayTex, bumpTex, specTex, nightTex].forEach(t => { t.anisotropy = maxAniso; });

      this.EARTH_RADIUS = 2.3;
      const earthGeo = new THREE.SphereGeometry(this.EARTH_RADIUS, 96, 96);
      const earthMat = new THREE.MeshPhongMaterial({
        map: dayTex, bumpMap: bumpTex, bumpScale: 0.05,
        specularMap: specTex, specular: new THREE.Color(0x334455), shininess: 15
      });

      // Night lights injection
      earthMat.onBeforeCompile = (shader) => {
        shader.uniforms.nightTexture = { value: nightTex };
        shader.uniforms.sunDirection = { value: new THREE.Vector3(1, 0.3, 0.7).normalize() };
        earthMat.userData.shader = shader;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldNormal = normalize(mat3(modelMatrix) * normal);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D nightTexture;\nuniform vec3 sunDirection;\nvarying vec3 vWorldNormal;')
          .replace('#include <dithering_fragment>',
            `#include <dithering_fragment>
             float sunDot = dot(vWorldNormal, sunDirection);
             float nightMix = smoothstep(0.15, -0.15, sunDot);
             vec3 nightColor = texture2D(nightTexture, vUv).rgb;
             gl_FragColor.rgb += nightColor * nightMix * 1.6;`);
      };

      this.earth = new THREE.Mesh(earthGeo, earthMat);
      this.earthMat = earthMat;
      // Save original appearance so _dimEarth can be reversed on showWorldView()
      this._earthOriginalColor = earthMat.color.clone();
      this._earthOriginalEmissive = earthMat.emissiveIntensity || 0.25;
      this.worldGroup.add(this.earth);

      // Atmosphere
      const atmoGeo = new THREE.SphereGeometry(this.EARTH_RADIUS * 1.11, 64, 64);
      const atmoMat = new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending,
        uniforms: { c: { value: 0.45 }, p: { value: 5.0 }, glowColor: { value: new THREE.Color(0x4aa3ff) } },
        vertexShader: `varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 glowColor; uniform float c; uniform float p; varying vec3 vNormal; void main(){ float intensity = pow(c - dot(vNormal, vec3(0,0,1)), p); gl_FragColor = vec4(glowColor, 1.0) * intensity; }`
      });
      this.atmo = new THREE.Mesh(atmoGeo, atmoMat);
      this.worldGroup.add(this.atmo);

      // ═══════════════════════════════════════════════════════
      // Space background now comes from the <video id="spaceBg"> element in intro.html.
      // The Three.js renderer has transparent clear color, so the video shows through.
      // (The shader-based galaxy is disabled here; function is kept for reference.)
      // this._buildGalaxy();

      // Initial positioning: RIGHT side of screen
      // Earth x=3.2 puts it visually on the right half; camera looks at (0,0,0) so earth appears off-center
      this.worldGroup.position.x = 3.2;
      this.worldGroup.rotation.x = -0.41;
      this.worldGroup.rotation.y = -1.4;

      // Save initial camera/target for returning to hero mode
      this._heroCamPos = new THREE.Vector3(0, 0, 8);
      this._heroTarget = new THREE.Vector3(0, 0, 0);  // look at origin, NOT at earth
    }

    /** Build a dramatic colorful sci-fi galaxy background.
     *  - Thousands of stars across multiple color families + size tiers
     *  - Large colorful nebula cloud sprites (purple/pink/teal/cyan)
     *  - Dusty Milky Way band
     *  All added to this.scene (not worldGroup) so they stay fixed
     *  when the earth fades / rotates / is replaced by the flat India map.
     */
    _buildGalaxy() {
      this.galaxyGroup = new THREE.Group();
      this.scene.add(this.galaxyGroup);

      // ═════════════════════════════════════════════════════════════
      // PROCEDURAL ANIMATED NEBULA (GLSL shader on inside-out sphere)
      // Uses multi-octave fbm noise to generate organic clouds that
      // drift and shift over time. Layered with procedural stars.
      // Never looks like a photo — always fluid and alive.
      // ═════════════════════════════════════════════════════════════
      const SKY_RADIUS = 200;
      const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 64, 64);

      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform float uTime;
          varying vec3 vWorldPos;

          // ── Hash + 3D value noise ─────────────────────────────
          float hash(vec3 p) {
            p = fract(p * vec3(443.8975, 397.2973, 491.1871));
            p += dot(p, p.yzx + 19.19);
            return fract((p.x + p.y) * p.z);
          }

          float noise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f); // smoothstep
            float n000 = hash(i);
            float n100 = hash(i + vec3(1.0, 0.0, 0.0));
            float n010 = hash(i + vec3(0.0, 1.0, 0.0));
            float n110 = hash(i + vec3(1.0, 1.0, 0.0));
            float n001 = hash(i + vec3(0.0, 0.0, 1.0));
            float n101 = hash(i + vec3(1.0, 0.0, 1.0));
            float n011 = hash(i + vec3(0.0, 1.0, 1.0));
            float n111 = hash(i + vec3(1.0, 1.0, 1.0));
            return mix(
              mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
              mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
              f.z
            );
          }

          // Fractal Brownian motion — layered noise octaves
          float fbm(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 6; i++) {
              v += a * noise(p);
              p *= 2.02;
              a *= 0.5;
            }
            return v;
          }

          // Stars: high-frequency sharp spots on top of nebula
          float stars(vec3 p, float threshold) {
            float n = hash(floor(p * 180.0));
            // Only show the top few percent as star highlights
            float s = smoothstep(threshold, 1.0, n);
            return s * s * s;
          }

          void main() {
            // Normalize direction vector to sample from
            vec3 dir = normalize(vWorldPos);

            // Scroll the noise slowly over time for a living feel
            float t = uTime * 0.015;
            vec3 p1 = dir * 1.3 + vec3(t * 0.3, t * 0.15, 0.0);
            vec3 p2 = dir * 2.5 + vec3(-t * 0.2, t * 0.4, t * 0.25);
            vec3 p3 = dir * 0.7 + vec3(t * 0.1, -t * 0.2, t * 0.1);

            // Large structure — main nebula clouds
            float cloud1 = fbm(p1);
            // Finer detail
            float cloud2 = fbm(p2 + cloud1 * 0.5);
            // Very large scale variation
            float cloud3 = fbm(p3);

            // Combine for a rich layered cloud
            float density = cloud1 * 0.6 + cloud2 * 0.4;
            density = pow(density, 1.8);

            // Base deep-space dark navy/black
            vec3 deepSpace = vec3(0.01, 0.015, 0.04);

            // Nebula color palette — smoothly mix based on noise
            // This gives natural variation across the sky
            vec3 purple    = vec3(0.45, 0.18, 0.68);
            vec3 violet    = vec3(0.60, 0.25, 0.85);
            vec3 magenta   = vec3(0.85, 0.30, 0.75);
            vec3 teal      = vec3(0.20, 0.60, 0.75);
            vec3 indigo    = vec3(0.25, 0.20, 0.70);
            vec3 pink      = vec3(0.95, 0.55, 0.80);
            vec3 amber     = vec3(0.85, 0.55, 0.30);

            // Pick dominant color based on large-scale structure (cloud3)
            vec3 nebulaColor;
            if (cloud3 < 0.35) {
              nebulaColor = mix(indigo, purple, smoothstep(0.2, 0.45, cloud3));
            } else if (cloud3 < 0.55) {
              nebulaColor = mix(purple, violet, smoothstep(0.35, 0.55, cloud3));
            } else if (cloud3 < 0.7) {
              nebulaColor = mix(violet, magenta, smoothstep(0.55, 0.7, cloud3));
            } else if (cloud3 < 0.85) {
              nebulaColor = mix(magenta, teal, smoothstep(0.7, 0.85, cloud3));
            } else {
              nebulaColor = mix(teal, pink, smoothstep(0.85, 1.0, cloud3));
            }

            // Hot spots — occasional warm orange patches where clouds are densest
            float hotSpot = smoothstep(0.75, 0.95, cloud1) * smoothstep(0.5, 0.8, cloud2);
            nebulaColor = mix(nebulaColor, amber, hotSpot * 0.6);

            // Final nebula layer
            vec3 col = mix(deepSpace, nebulaColor, clamp(density * 1.8, 0.0, 1.0));

            // Bright cloud highlights where density is peaking
            float highlight = smoothstep(0.55, 0.85, density);
            col += nebulaColor * highlight * 0.3;

            // ── PROCEDURAL STAR LAYER ────────────────────────────────
            // Dense small stars (tier 1)
            float s1 = stars(dir, 0.985);
            col += vec3(1.0, 0.98, 0.92) * s1 * 1.5;

            // Medium stars (tier 2)
            float s2 = stars(dir + vec3(37.1, 13.2, 91.3), 0.992);
            col += vec3(0.85, 0.95, 1.0) * s2 * 2.5;

            // Big rare bright stars (tier 3) with subtle color
            float s3 = stars(dir + vec3(91.7, 48.1, 22.6), 0.997);
            // vary the color of big stars
            float starHue = hash(floor(dir * 200.0));
            vec3 bigStarColor;
            if (starHue < 0.3) bigStarColor = vec3(1.0, 0.85, 0.75);      // warm
            else if (starHue < 0.5) bigStarColor = vec3(0.75, 0.85, 1.0); // blue-white
            else if (starHue < 0.7) bigStarColor = vec3(1.0, 0.9, 0.95);  // pinkish
            else bigStarColor = vec3(1.0, 1.0, 1.0);                      // pure white
            col += bigStarColor * s3 * 5.0;

            // ── Subtle twinkle ─────────────────────────────────────
            // Modulate the smallest stars' brightness with time
            float twinkle = 0.85 + 0.15 * sin(uTime * 2.0 + hash(floor(dir * 180.0)) * 6.28);
            // Apply only to s1 stars
            col = mix(col, col * vec3(twinkle), s1 * 0.3);

            // Gentle overall darkening at edges so earth pops more
            // (subtle vignette via direction dot product not needed on sphere)

            gl_FragColor = vec4(col, 1.0);
          }
        `
      });

      const skybox = new THREE.Mesh(skyGeo, skyMat);
      skybox.renderOrder = -1; // render first
      this.galaxyGroup.add(skybox);
      this.skybox = skybox;
      this.skyMat = skyMat;

      // Keep reference for animation
      this.stars = this.galaxyGroup;
    }

    // ─── EXTRUDE A GEOJSON POLYGON INTO A 3D MESH ─────────────────
    // `projectFn(lat, lng)` returns [x, y] in local space
    // `height` is the extrusion depth
    // Returns a THREE.Mesh ready to add to scene
    /** Create a minimal text label sprite — just AQI color box + name, NO panel background.
     *  Matches the styling of the HTML AQI legend (tiny color swatch + plain text). */
    _makeLabelSprite(text, aqiColorHex, opts = {}) {
      // Use a smallish font to match the AQI legend sidebar
      const fontSize = opts.fontSize || 28;
      const badge = opts.badge !== false;

      // Measure text
      const m = document.createElement('canvas').getContext('2d');
      m.font = `600 ${fontSize}px Rajdhani, Arial, sans-serif`;
      const textW = m.measureText(text).width;

      // Layout: [padding] [small color square] [gap] [text] [padding]
      // Canvas has NO background — it's drawn transparent so only the swatch + text show.
      const swatchSize = Math.round(fontSize * 0.7);
      const gap = Math.round(fontSize * 0.3);
      const padding = Math.round(fontSize * 0.25);  // extra padding for text-shadow halo
      const totalW = padding * 2 + (badge ? swatchSize + gap : 0) + textW;
      const totalH = fontSize + padding * 2;

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(totalW);
      canvas.height = Math.ceil(totalH);
      const ctx = canvas.getContext('2d');

      let cursorX = padding;

      // Tiny AQI color swatch (matches legend style)
      if (badge) {
        const bY = (canvas.height - swatchSize) / 2;
        // Subtle outer dark halo for contrast on bright backgrounds
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(cursorX - 1, bY - 1, swatchSize + 2, swatchSize + 2);
        // Color fill
        ctx.fillStyle = aqiColorHex || '#888';
        ctx.fillRect(cursorX, bY, swatchSize, swatchSize);
        cursorX += swatchSize + gap;
      }

      // Text with dark shadow + outline so it's readable against any map color
      ctx.font = `600 ${fontSize}px Rajdhani, Arial, sans-serif`;
      ctx.textBaseline = 'middle';

      // Shadow halo (multiple passes = soft glow)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillText(text, cursorX, canvas.height / 2 + 1);

      // Main text (white, crisp)
      ctx.shadowBlur = 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.fillText(text, cursorX, canvas.height / 2);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      const worldScale = opts.worldScale || 0.008;
      sprite.scale.set(canvas.width * worldScale, canvas.height * worldScale, 1);
      sprite.renderOrder = 999;
      return sprite;
    }

    /** Compute centroid (lat, lng) of a GeoJSON feature (using polygon vertex average) */
    _featureCentroid(feature) {
      let sumLat = 0, sumLng = 0, count = 0;
      const accRing = (ring) => {
        for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; count++; }
      };
      const geom = feature.geometry;
      if (geom.type === 'Polygon') geom.coordinates.forEach(accRing);
      else if (geom.type === 'MultiPolygon') {
        // Use the largest ring for centroid
        let largest = geom.coordinates[0][0];
        let largestSize = largest.length;
        geom.coordinates.forEach(poly => {
          if (poly[0].length > largestSize) { largest = poly[0]; largestSize = poly[0].length; }
        });
        accRing(largest);
      }
      return { lat: count ? sumLat / count : 0, lng: count ? sumLng / count : 0 };
    }

    _buildExtrudedFeature(feature, projectFn, height, color, opacity = 0.9) {
      const shapes = [];
      const makeShape = (ring) => {
        const shape = new THREE.Shape();
        ring.forEach(([lng, lat], i) => {
          const [x, y] = projectFn(lat, lng);
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        return shape;
      };

      const geom = feature.geometry;
      if (geom.type === 'Polygon') {
        const outer = makeShape(geom.coordinates[0]);
        // holes
        for (let i = 1; i < geom.coordinates.length; i++) {
          const hole = new THREE.Path();
          geom.coordinates[i].forEach(([lng, lat], j) => {
            const [x, y] = projectFn(lat, lng);
            if (j === 0) hole.moveTo(x, y);
            else hole.lineTo(x, y);
          });
          outer.holes.push(hole);
        }
        shapes.push(outer);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => {
          const outer = makeShape(poly[0]);
          for (let i = 1; i < poly.length; i++) {
            const hole = new THREE.Path();
            poly[i].forEach(([lng, lat], j) => {
              const [x, y] = projectFn(lat, lng);
              if (j === 0) hole.moveTo(x, y);
              else hole.lineTo(x, y);
            });
            outer.holes.push(hole);
          }
          shapes.push(outer);
        });
      }

      const extrudeGeo = new THREE.ExtrudeGeometry(shapes, {
        depth: height,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.01,
        bevelThickness: 0.01,
        steps: 1
      });

      const mat = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity,
        shininess: 30,
        emissive: color,
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(extrudeGeo, mat);
      return mesh;
    }

    // ══════════════════════════════════════════════════════════════
    // ─── PHASE 1: BUILD STATE-LEVEL VIEW (FLAT INDIA MAP) ────────
    //   Like the reference image — India shown as a floating flat 3D
    //   map with each state extruded and colored by AQI.
    // ══════════════════════════════════════════════════════════════
    async loadIndiaStates(stateAQIs = {}) {
      if (this.indiaStatesLoaded) return;
      const geo = await loadGeo(INDIA_URL);

      // Compute overall bounds so we can center India on screen
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      geo.features.forEach(feat => {
        const b = featureBounds(feat);
        if (b.minLat < minLat) minLat = b.minLat;
        if (b.maxLat > maxLat) maxLat = b.maxLat;
        if (b.minLng < minLng) minLng = b.minLng;
        if (b.maxLng > maxLng) maxLng = b.maxLng;
      });
      const cLat = (minLat + maxLat) / 2;
      const cLng = (minLng + maxLng) / 2;
      const span = Math.max(maxLat - minLat, maxLng - minLng);
      const targetSize = 4.0;  // bumped for bigger India
      const scale = targetSize / span;

      const proj = (lat, lng) => [(lng - cLng) * scale, (lat - cLat) * scale];

      this.indiaMapGroup = new THREE.Group();

      geo.features.forEach(feat => {
        const name = feat.properties.st_nm || feat.properties.NAME_1 || feat.properties.name || 'Unknown';
        const key = normalizeName(name);
        let aqi = stateAQIs[key];
        if (aqi == null) {
          // Deterministic AQI fallback so every state is colored
          let h = 0;
          for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) & 0xffffffff;
          aqi = 50 + Math.abs(h) % 170;
        }
        const color = aqiColor(aqi);
        const mesh = this._buildExtrudedFeature(feat, proj, 0.12, color, 0.92);
        mesh.userData = { name, aqi, originalColor: color, type: 'state' };
        this.indiaMapGroup.add(mesh);
        this.stateMeshes.set(key, { mesh, name, originalColor: color, aqi });
      });

      // Tilt like the Tamil Nadu reference — mostly flat, slight lean toward camera
      this.indiaMapGroup.rotation.x = -Math.PI / 2.4;
      this.indiaMapGroup.position.set(0, -0.3, 0);
      this.indiaGroup.add(this.indiaMapGroup);

      this.indiaStatesLoaded = true;
    }

    /** ═══════════════════════════════════════════════════════════
     *  SIMPLE RELIABLE FLY-IN
     *  ─────────────────────────────────────────────────────────────
     *  1. Earth stops rotating, scales down, and fades out
     *  2. Flat 3D India map fades in at center with colored states
     *
     *  Simpler than before but guaranteed to work.
     *  ═══════════════════════════════════════════════════════════ */
    async flyToNation(nationCode, stateAQIs = {}) {
      if (nationCode !== 'IN') {
        console.warn('Only India (IN) is supported currently.');
        return;
      }
      console.log('[flyToNation] Starting');

      // Pre-load India GeoJSON in parallel
      const dataPromise = this.indiaStatesLoaded
        ? Promise.resolve()
        : this.loadIndiaStates(stateAQIs).catch(e => console.warn('Failed to load India:', e));

      this.mode = 'flying';
      this._flyingToNation = true;

      // Phase 1: Shrink + fade the earth over 1 second
      const FADE_DURATION = 1000;
      // Animate earth group scale down and move to center
      tween(this.worldGroup.position, { x: 0 }, FADE_DURATION, easeInOutCubic);
      tween(this.worldGroup.scale, { x: 0.3, y: 0.3, z: 0.3 }, FADE_DURATION, easeInOutCubic);
      this._fadeGroup(this.worldGroup, 1.0, 0.0, FADE_DURATION, () => {
        this.worldGroup.visible = false;
      });

      // Reset camera to standard view
      tween(this.camera.position, { x: 0, y: 0, z: 5.5 }, FADE_DURATION, easeInOutCubic);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, FADE_DURATION, easeInOutCubic);

      // Wait for earth to fade + data to load
      await Promise.all([
        new Promise(r => setTimeout(r, FADE_DURATION)),
        dataPromise
      ]);

      console.log('[flyToNation] Earth faded, showing India map');

      if (!this.indiaMapGroup) {
        console.error('[flyToNation] India map was not built! Check GeoJSON loading.');
        return;
      }

      // Phase 2: Show India map fading in + scaling up
      this.indiaGroup.visible = true;
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;

      // Update colors from stateAQIs
      for (const [key, info] of this.stateMeshes.entries()) {
        const aqi = stateAQIs[key];
        if (aqi != null) {
          const c = new THREE.Color(aqiColor(aqi));
          info.mesh.material.color.copy(c);
          info.mesh.material.emissive.copy(c);
          info.originalColor = aqiColor(aqi);
          info.mesh.userData.aqi = aqi;
        }
      }

      // Make sure indiaMapGroup starts fresh each time
      this.indiaMapGroup.scale.set(0.3, 0.3, 0.3);
      this.indiaMapGroup.position.set(0, -0.3, 0);

      // Position india group on the RIGHT side of the screen (mirror of hero layout)
      this.indiaGroup.position.set(2.2, 0, 0);
      this.indiaGroup.rotation.set(0, 0, 0);
      this._cameraDistance = 7.0;

      // Fade in + scale up
      tween(this.indiaMapGroup.scale, { x: 1, y: 1, z: 1 }, 1200, easeOutCubic);
      this._fadeGroup(this.indiaGroup, 0.0, 1.0, 1000);

      // Camera settles looking at origin (so india appears on right side)
      tween(this.camera.position, { x: 0, y: 0.3, z: 7.0 }, 1200, easeInOutCubic);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, 1200, easeInOutCubic);

      // Rise-in animation for individual states (first time only)
      if (!this._indiaRisen) {
        this._indiaRisen = true;
        this.indiaMapGroup.children.forEach((mesh, i) => {
          mesh.scale.z = 0.01;
          setTimeout(() => {
            tween(mesh.scale, { z: 1 }, 500, easeOutCubic);
          }, 400 + i * 20);
        });
      }

      this.mode = 'india';
      this._flyingToNation = false;

      console.log('[flyToNation] Complete');
    }

    /** Draw India's border as a progressive glowing line on the sphere surface.
     *  Returns a promise that resolves when the tracing animation completes. */
    async _drawIndiaBorder(geo) {
      // Remove any previous border
      if (this._indiaBorderLines) {
        this._indiaBorderLines.forEach(l => {
          if (l.parent) l.parent.remove(l);
          if (l.geometry) l.geometry.dispose();
          if (l.material) l.material.dispose();
        });
      }
      this._indiaBorderLines = [];

      // Collect all outer boundary rings of all state polygons
      // Place each point ON the earth's surface at radius = EARTH_RADIUS + 0.005 (just above surface)
      const R = this.EARTH_RADIUS + 0.005;
      const allRings = [];
      geo.features.forEach(feat => {
        const g = feat.geometry;
        if (g.type === 'Polygon') {
          allRings.push(g.coordinates[0]);
        } else if (g.type === 'MultiPolygon') {
          g.coordinates.forEach(poly => allRings.push(poly[0]));
        }
      });

      // Each ring → a THREE.Line with a custom shader that animates a "progress" uniform
      // from 0 to 1 to reveal the line progressively. Also use a glow color.
      const totalDuration = 1500; // ms to draw all borders
      const startTime = performance.now();

      allRings.forEach(ring => {
        const positions = new Float32Array(ring.length * 3);
        for (let i = 0; i < ring.length; i++) {
          const [lng, lat] = ring[i];
          const p = latLngToVec3(lat, lng, R);
          positions[i * 3]     = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Compute cumulative arc length per vertex (for progressive reveal)
        const aLen = new Float32Array(ring.length);
        let total = 0;
        for (let i = 1; i < ring.length; i++) {
          const dx = positions[i*3] - positions[(i-1)*3];
          const dy = positions[i*3+1] - positions[(i-1)*3+1];
          const dz = positions[i*3+2] - positions[(i-1)*3+2];
          total += Math.sqrt(dx*dx + dy*dy + dz*dz);
          aLen[i] = total;
        }
        // Normalize to 0..1
        for (let i = 0; i < ring.length; i++) aLen[i] /= (total || 1);
        geom.setAttribute('aLen', new THREE.BufferAttribute(aLen, 1));

        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uProgress: { value: 0 },
            uColor: { value: new THREE.Color(0x4af5ff) }
          },
          vertexShader: `
            attribute float aLen;
            varying float vLen;
            void main() {
              vLen = aLen;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: `
            uniform float uProgress;
            uniform vec3 uColor;
            varying float vLen;
            void main() {
              // Visible only where the cumulative length is below progress
              if (vLen > uProgress) discard;
              // Brightness peaks at the leading edge of the progress for a "pulse"
              float headDist = uProgress - vLen;
              float pulse = 1.0 - smoothstep(0.0, 0.08, headDist);
              vec3 col = uColor + uColor * pulse * 2.0;
              float alpha = 0.85 + pulse * 0.15;
              gl_FragColor = vec4(col, alpha);
            }`
        });

        const line = new THREE.Line(geom, mat);
        line.userData._startMat = mat;
        // Border travels WITH the sphere (so rotation/scale still apply)
        this.worldGroup.add(line);
        this._indiaBorderLines.push(line);
      });

      // Animate uProgress on all lines from 0 → 1 over totalDuration
      return new Promise(resolve => {
        const animateBorder = () => {
          const t = Math.min(1, (performance.now() - startTime) / totalDuration);
          const eased = easeInOutCubic(t);
          this._indiaBorderLines.forEach(l => {
            if (l.material && l.material.uniforms) {
              l.material.uniforms.uProgress.value = eased;
            }
          });
          if (t < 1) requestAnimationFrame(animateBorder);
          else {
            // Hold for a brief moment with the full border lit
            setTimeout(resolve, 150);
          }
        };
        animateBorder();
      });
    }

    /** Pop 3D India UP out of the sphere toward the camera. */
    async _popOutIndia(stateAQIs) {
      this.mode = 'india';
      this._flyingToNation = false;

      if (!this.indiaMapGroup) {
        console.warn('India map not ready');
        return;
      }

      // Update colors from aqi data
      if (Object.keys(stateAQIs).length && this.stateMeshes.size) {
        for (const [key, info] of this.stateMeshes.entries()) {
          const aqi = stateAQIs[key];
          if (aqi != null) {
            const c = new THREE.Color(aqiColor(aqi));
            info.mesh.material.color.copy(c);
            info.mesh.material.emissive.copy(c);
            info.originalColor = aqiColor(aqi);
            info.mesh.userData.aqi = aqi;
          }
        }
      }

      // Show india group but make it tiny at first.
      // Place at the CENTER of the camera view so it visually rises out of whatever
      // the camera is looking at (which, after fly-in, is India on the sphere).
      this.indiaGroup.visible = true;
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;

      // Starting: tiny and centered in the view (in front of the sphere)
      // The sphere after fly-in has scale 1.2 and its front surface is at z ≈ 2.3*1.2 = 2.76 in world space.
      // Put India's starting Z slightly in front of the sphere's surface so the pop LOOKS like it comes out.
      const startZ = 2.5;
      const endZ = 0.2;

      this.indiaMapGroup.scale.set(0.05, 0.05, 0.05);
      this.indiaMapGroup.position.set(0, -0.3, startZ);

      // Tween: rise out of the sphere toward the camera while growing
      const popDuration = 1200;
      tween(this.indiaMapGroup.scale, { x: 1, y: 1, z: 1 }, popDuration, easeOutCubic);
      tween(this.indiaMapGroup.position, { z: endZ, y: -0.3 }, popDuration, easeOutCubic);
      // Fade from 0 → full opacity
      this._fadeGroup(this.indiaGroup, 0.0, 1.0, 900);

      // NOTE: camera stays at z=3.6 from the fly-in, so the pop-out India fills the screen nicely.
      // Do NOT tween camera.z back out here (that was causing the "zoom in then zoom out" glitch).

      // Rise-in animation for individual states (first time only)
      if (!this._indiaRisen) {
        this._indiaRisen = true;
        this.indiaMapGroup.children.forEach((mesh, i) => {
          const originalScaleZ = 1;
          mesh.scale.z = 0.01;
          setTimeout(() => {
            tween(mesh.scale, { z: originalScaleZ }, 500, easeOutCubic);
          }, 600 + i * 20);
        });
      }

      // Wait for the pop to complete
      await new Promise(r => setTimeout(r, popDuration + 100));
    }

    /** Dim the earth sphere so the flat India map is the focus.
     *  Sphere stays visible in background. */
    _dimEarth() {
      if (!this.earthMat) return;
      // Reduce emissive intensity & darken the material
      const current = { e: this.earthMat.emissiveIntensity || 0.25, opacity: 1 };
      tween(current, { e: 0.05 }, 1000);
      const startTime = performance.now();
      const dimLoop = () => {
        if (!this.earthMat) return;
        this.earthMat.emissiveIntensity = current.e;
        // Also fade the atmosphere
        if (this.atmo && this.atmo.material && this.atmo.material.uniforms) {
          this.atmo.material.uniforms.c.value = Math.max(0.15, current.e * 1.5);
        }
        if (performance.now() - startTime < 1100) requestAnimationFrame(dimLoop);
      };
      dimLoop();

      // Also reduce the earth's color to ~30% brightness via a multiplied material color
      if (this.earthMat.color) {
        const target = new THREE.Color(0x4a4a55); // dark grey-blue tint
        const start = this.earthMat.color.clone();
        const startTime2 = performance.now();
        const colorLoop = () => {
          const p = Math.min(1, (performance.now() - startTime2) / 1000);
          const eased = easeInOutCubic(p);
          this.earthMat.color.r = start.r + (target.r - start.r) * eased;
          this.earthMat.color.g = start.g + (target.g - start.g) * eased;
          this.earthMat.color.b = start.b + (target.b - start.b) * eased;
          if (p < 1) requestAnimationFrame(colorLoop);
        };
        colorLoop();
      }
    }

    /** Morph: fade out the spherical earth while the flat India map rises in with AQI colors */
    _morphSphereToFlat(stateAQIs) {
      this.mode = 'india';
      this._flyingToNation = false;

      // Make sure india group is visible (fade in)
      this.indiaGroup.visible = true;
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;

      // Update state mesh colors from stateAQIs
      if (Object.keys(stateAQIs).length && this.stateMeshes.size) {
        for (const [key, info] of this.stateMeshes.entries()) {
          const aqi = stateAQIs[key];
          if (aqi != null) {
            const c = new THREE.Color(aqiColor(aqi));
            info.mesh.material.color.copy(c);
            info.mesh.material.emissive.copy(c);
            info.originalColor = aqiColor(aqi);
            info.mesh.userData.aqi = aqi;
          }
        }
      }

      // Camera settles to India view
      tween(this.camera.position, { x: 0, y: 0.4, z: 4.5 }, 1600, easeInOutCubic);
      tween(this.cameraTarget, { x: 0, y: -0.3, z: 0 }, 1600, easeInOutCubic);

      // Start the india map at ~0.4 scale and expand to full size (feels like the sphere "unfolds")
      if (this.indiaMapGroup) {
        this.indiaMapGroup.scale.set(0.4, 0.4, 0.4);
        tween(this.indiaMapGroup.scale, { x: 1, y: 1, z: 1 }, 1400, easeOutCubic);
      }

      // Cross-fade: earth → india
      this._fadeGroup(this.worldGroup, 1.0, 0.0, 1400, () => {
        this.worldGroup.visible = false;
        // Reset globe state so showWorldView works cleanly if user navigates back
        this.worldGroup.scale.set(1, 1, 1);
      });
      this._fadeGroup(this.indiaGroup, 0.0, 1.0, 1400);

      // Rise-in animation for states (first morph only)
      if (this.indiaMapGroup && !this._indiaRisen) {
        this._indiaRisen = true;
        this.indiaMapGroup.children.forEach((mesh, i) => {
          const originalScaleZ = mesh.scale.z || 1;
          mesh.scale.z = 0.01;
          setTimeout(() => {
            tween(mesh.scale, { z: originalScaleZ }, 700, easeOutCubic);
          }, 300 + i * 25);
        });
      }
    }

    /** Show the world/earth view (hero mode) */
    showWorldView() {
      this.mode = 'world';
      this.worldGroup.visible = true;
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;
      this.indiaGroup.visible = false;
      // Resume auto-rotation when returning to hero (until user drags again)
      this._userRotatingWorld = false;

      // Animate camera back to hero position (earth on right side of screen)
      tween(this.camera.position, { x: 0, y: 0, z: 8 }, 1500);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, 1500);
      tween(this.worldGroup.position, { x: 3.2 }, 1500);
    }

    /** Fade out earth, fade in flat India map with states AQI-colored */
    async zoomToIndia(stateAQIs = {}, highlightStateName = null) {
      this.mode = 'india';

      // Load data if needed (caches after first load)
      if (!this.indiaStatesLoaded) {
        try { await this.loadIndiaStates(stateAQIs); }
        catch (e) {
          console.warn('Failed to load India states from CDN:', e);
          // If CDN failed, fall back to just keeping the globe visible
          return;
        }
      } else if (Object.keys(stateAQIs).length) {
        // Update existing mesh colors without rebuilding
        for (const [key, info] of this.stateMeshes.entries()) {
          const aqi = stateAQIs[key];
          if (aqi != null) {
            const c = new THREE.Color(aqiColor(aqi));
            info.mesh.material.color.copy(c);
            info.mesh.material.emissive.copy(c);
            info.originalColor = aqiColor(aqi);
            info.mesh.userData.aqi = aqi;
          }
        }
      }

      // Make sure india group is visible and others hidden
      this.indiaGroup.visible = true;
      this.stateGroup.visible = false;
      this.districtGroup.visible = false;

      // Position on RIGHT side
      this.indiaGroup.position.set(2.2, 0, 0);
      this.indiaGroup.rotation.set(0, 0, 0);

      // Camera: look at origin so india appears on right
      tween(this.camera.position, { x: 0, y: 0.3, z: 5.5 }, 1800);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, 1800);

      // Cross-fade: fade world out, india in
      if (this.worldGroup.visible) {
        this._fadeGroup(this.worldGroup, 1.0, 0.0, 1500, () => {
          this.worldGroup.visible = false;
        });
      }
      this._fadeGroup(this.indiaGroup, 0.0, 1.0, 1500);

      // Rise-in animation for states (first time only)
      if (this.indiaMapGroup && !this._indiaRisen) {
        this._indiaRisen = true;
        this.indiaMapGroup.children.forEach((mesh, i) => {
          mesh.scale.z = 0.01;
          setTimeout(() => {
            tween(mesh.scale, { z: 1 }, 600, easeOutCubic);
          }, i * 30);
        });
      }

      if (highlightStateName) this.highlightState(highlightStateName);
    }

    /** Highlight a single state (pulse + raise) without switching mode */
    highlightState(stateName) {
      const key = normalizeName(stateName);
      for (const [k, info] of this.stateMeshes.entries()) {
        const isTarget = k === key;
        const m = info.mesh;
        if (isTarget) {
          m.material.emissiveIntensity = 0.8;
          m.material.opacity = 1.0;
          // Raise it slightly
          tween(m.position, { z: 0.12 }, 600, easeOutCubic);
          this._highlightedState = m;
        } else {
          m.material.emissiveIntensity = 0.15;
          m.material.opacity = 0.75;
          tween(m.position, { z: 0 }, 600, easeOutCubic);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // ─── PHASE 2: STATE → DISTRICTS VIEW ─────────────────────────
    // ══════════════════════════════════════════════════════════════
    async zoomToState(stateName, districtAQIs = {}) {
      this.mode = 'state';
      this.currentStateName = stateName;

      const slug = stateSlug(stateName);
      let geo;
      try { geo = await loadGeo(STATE_URL(slug)); }
      catch (e) { console.warn('Could not load state ' + slug, e); return; }

      // Clear previous state group
      while (this.stateGroup.children.length) {
        const c = this.stateGroup.children[0];
        this.stateGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose && c.material.dispose();
      }
      this.districtMeshes.clear();

      // Compute overall bounds so we can center + scale the state
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      geo.features.forEach(feat => {
        const b = featureBounds(feat);
        if (b.minLat < minLat) minLat = b.minLat;
        if (b.maxLat > maxLat) maxLat = b.maxLat;
        if (b.minLng < minLng) minLng = b.minLng;
        if (b.maxLng > maxLng) maxLng = b.maxLng;
      });
      const cLat = (minLat + maxLat) / 2;
      const cLng = (minLng + maxLng) / 2;
      const span = Math.max(maxLat - minLat, maxLng - minLng);
      const targetSize = 2.8;
      const scale = targetSize / span;

      const proj = (lat, lng) => [(lng - cLng) * scale, (lat - cLat) * scale];

      this.currentStateCenter = { lat: cLat, lng: cLng, scale };

      const stateGroupInner = new THREE.Group();
      geo.features.forEach((feat, idx) => {
        const dname = feat.properties.district || feat.properties.NAME_2 || feat.properties.name || 'Unknown';
        const key = normalizeName(dname);
        let aqi = districtAQIs[key];
        if (aqi == null) {
          // Fallback: derive a deterministic AQI from the district name so every district gets a color
          let h = 0;
          for (let c = 0; c < dname.length; c++) h = (h * 31 + dname.charCodeAt(c)) & 0xffffffff;
          // Spread across 40..220 AQI band for visual variety
          aqi = 40 + Math.abs(h) % 180;
        }
        const color = aqiColor(aqi);
        const colorHex = '#' + color.toString(16).padStart(6, '0');
        const mesh = this._buildExtrudedFeature(feat, proj, 0.15, color, 0.92);
        mesh.userData = { name: dname, aqi, type: 'district', originalColor: color };
        stateGroupInner.add(mesh);
        this.districtMeshes.set(key, { mesh, name: dname, originalColor: color, aqi });

        // Label sprite at district centroid, floating above the extruded polygon
        const centroid = this._featureCentroid(feat);
        const [lx, ly] = proj(centroid.lat, centroid.lng);
        const label = this._makeLabelSprite(dname, colorHex, {
          fontSize: 16, worldScale: 0.004
        });
        label.position.set(lx, ly, 0.35);  // above the extruded district top face
        stateGroupInner.add(label);
      });
      // Tilt slightly for 3D feel (like Tamil Nadu reference)
      stateGroupInner.rotation.x = -Math.PI / 2.4;  // lay mostly flat, tilted toward camera
      stateGroupInner.position.set(0, -0.3, 0);
      this.stateGroup.add(stateGroupInner);

      // Position state group on RIGHT side (mirror of picker text on left)
      this.stateGroup.position.set(2.2, 0, 0);
      this.stateGroup.rotation.set(0, 0, 0);
      this._cameraDistance = 5.5;

      // Camera: look at origin so state map appears on right
      tween(this.camera.position, { x: 0, y: 0.3, z: 5.5 }, 1800);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, 1800);

      // Cross-fade from whatever was visible before (world OR india) into stateGroup
      if (this.worldGroup.visible) {
        this._fadeGroup(this.worldGroup, 1.0, 0.0, 1200, () => { this.worldGroup.visible = false; });
      }
      if (this.indiaGroup.visible) {
        this._fadeGroup(this.indiaGroup, 1.0, 0.0, 1200, () => { this.indiaGroup.visible = false; });
      }
      this.stateGroup.visible = true;
      this._fadeGroup(this.stateGroup, 0.0, 1.0, 1200);

      // Rise-in animation for districts
      stateGroupInner.children.forEach((mesh, i) => {
        mesh.scale.z = 0.01;
        setTimeout(() => {
          tween(mesh.scale, { z: 1 }, 600, easeOutCubic);
        }, i * 40);
      });
    }

    /** Highlight a district when picked in dropdown */
    highlightDistrict(districtName) {
      const key = normalizeName(districtName);
      for (const [k, info] of this.districtMeshes.entries()) {
        const isTarget = k === key;
        const m = info.mesh;
        if (isTarget) {
          m.material.emissiveIntensity = 0.8;
          m.material.opacity = 1.0;
          tween(m.position, { z: 0.25 }, 600, easeOutCubic);
        } else {
          m.material.emissiveIntensity = 0.15;
          m.material.opacity = 0.7;
          tween(m.position, { z: 0 }, 600, easeOutCubic);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // ─── PHASE 3: DISTRICT → CITIES VIEW ─────────────────────────
    // ══════════════════════════════════════════════════════════════
    async zoomToDistrict(districtName, cityData = []) {
      // cityData: [{ name, lat, lng, aqi }, ...]
      this.mode = 'district';
      this.currentDistrictName = districtName;

      // Reuse state geojson to find this district's polygon
      const slug = stateSlug(this.currentStateName);
      const geo = await loadGeo(STATE_URL(slug));
      const key = normalizeName(districtName);
      const feat = geo.features.find(f => {
        const n = f.properties.district || f.properties.NAME_2 || f.properties.name;
        return normalizeName(n) === key;
      });
      if (!feat) { console.warn('District not found:', districtName); return; }

      // Clear previous district group
      while (this.districtGroup.children.length) {
        const c = this.districtGroup.children[0];
        this.districtGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose && c.material.dispose();
      }
      this.cityPins = [];

      // Project just this district
      const b = featureBounds(feat);
      const span = Math.max(b.spanLat, b.spanLng);
      const targetSize = 3.0;
      const scale = targetSize / span;
      const proj = (lat, lng) => [(lng - b.centerLng) * scale, (lat - b.centerLat) * scale];

      this.currentDistrictCenter = { lat: b.centerLat, lng: b.centerLng, scale };

      const districtInner = new THREE.Group();

      // Base district map (darker, to serve as "ground")
      const baseMesh = this._buildExtrudedFeature(feat, proj, 0.1, 0x1a3358, 0.95);
      baseMesh.material.emissiveIntensity = 0.05;
      districtInner.add(baseMesh);

      // Pre-compute deterministic scatter positions inside the district bounds.
      // Cities in our data don't have real lat/lng, so we spread them in a
      // grid-ish pattern clipped to the district's bounding box. Pin positions
      // are seeded from the city name so they're stable between renders.
      const districtW = b.spanLng * scale;
      const districtH = b.spanLat * scale;
      const pinRadius = Math.min(districtW, districtH) * 0.3;

      // Add city pins — glowing vertical beams rising from the map
      cityData.forEach((city, i) => {
        let px, py;
        if (city.lat != null && city.lng != null) {
          [px, py] = proj(city.lat, city.lng);
        } else {
          // Deterministic position: seeded polar spiral around the district center
          const seed = 0;
          let h = 0;
          for (let c = 0; c < city.name.length; c++) h = (h * 31 + city.name.charCodeAt(c)) & 0xffffffff;
          const angle = (Math.abs(h) % 628) / 100; // 0..2π
          const radius = pinRadius * (0.25 + ((Math.abs(h) >> 8) % 100) / 150);
          px = Math.cos(angle) * radius;
          py = Math.sin(angle) * radius;
        }
        const color = aqiColor(city.aqi);
        const pinGroup = this._buildCityPin(px, py, color, city);
        districtInner.add(pinGroup);
        this.cityPins.push({ group: pinGroup, ...city });
      });

      districtInner.rotation.x = -Math.PI / 2.4;
      districtInner.position.set(0, -0.3, 0);
      this.districtGroup.add(districtInner);
      this._districtInnerGroup = districtInner;   // remember for updateDistrictCities
      this._districtProj = proj;                   // and the projection
      this._currentDistrictName = districtName;   // and the name for update checks

      // Position district group on RIGHT side
      this.districtGroup.position.set(2.2, 0, 0);
      this.districtGroup.rotation.set(0, 0, 0);
      this._cameraDistance = 5.5;

      tween(this.camera.position, { x: 0, y: 0.3, z: 5.5 }, 1500);
      tween(this.cameraTarget, { x: 0, y: 0, z: 0 }, 1500);

      this._fadeGroup(this.stateGroup, 1.0, 0.0, 1000, () => {
        this.stateGroup.visible = false;
      });
      this.districtGroup.visible = true;
      this._fadeGroup(this.districtGroup, 0.0, 1.0, 1000);
    }

    /** ═══════════════════════════════════════════════════════════════
     *  UPDATE DISTRICT CITIES (called when Overpass data arrives)
     *  ──────────────────────────────────────────────────────────────
     *  Replaces the initial seeded pins with real city/town data:
     *  - Uses actual lat/lng for placement
     *  - Sorts by population (bigger cities drawn on top)
     *  - Top ~15 places get labels immediately; smaller places
     *    appear as dots-only, revealing labels as user zooms in
     *  ═══════════════════════════════════════════════════════════════ */
    updateDistrictCities(districtName, cities, stateName) {
      if (!this._districtInnerGroup || this._currentDistrictName !== districtName) {
        return;  // user moved on
      }
      const inner = this._districtInnerGroup;
      const proj = this._districtProj;

      // Remove previous pin groups (keep the base mesh which is the first child)
      const toRemove = [];
      inner.children.forEach(c => {
        if (c.userData && c.userData.isCityPin) toRemove.push(c);
      });
      toRemove.forEach(c => {
        inner.remove(c);
        c.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose && o.material.dispose();
          }
        });
      });
      this.cityPins = [];

      // Compute an AQI estimate for each city (will be replaced by real interpolation in Phase 3).
      // For now: derive from place type + population using deterministic hash + district baseline.
      let baseAQI = 100;
      if (this._currentBaseAQI) baseAQI = this._currentBaseAQI;

      const enriched = cities.map((c, i) => {
        let h = 0;
        for (let k = 0; k < c.name.length; k++) h = (h * 31 + c.name.charCodeAt(k)) & 0xffffffff;
        const jitter = (Math.abs(h) % 60) - 30;
        const aqi = Math.max(25, Math.min(260, baseAQI + jitter));
        return { ...c, aqi };
      });

      // Rank by population desc; top 15 get labels from the start
      const rankedByPop = [...enriched].sort((a, b) => (b.population || 0) - (a.population || 0));
      const majorSet = new Set(rankedByPop.slice(0, 15).map(c => c.name));

      // Build pins
      enriched.forEach(city => {
        const [px, py] = proj(city.lat, city.lng);
        const color = aqiColor(city.aqi);
        const colorHex = '#' + color.toString(16).padStart(6, '0');
        const pinGroup = new THREE.Group();
        pinGroup.userData.isCityPin = true;
        pinGroup.userData.isMajor = majorSet.has(city.name);
        pinGroup.userData.city = city;

        // Short stem + colored head sphere (no tall beam)
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.012, 0.1, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
        );
        stem.position.set(px, py, 0.05);
        stem.rotation.x = Math.PI / 2;
        pinGroup.add(stem);

        const headSize = city.place === 'city' ? 0.05 : 0.035;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(headSize, 12, 12),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
        );
        head.position.set(px, py, 0.12);
        pinGroup.add(head);
        pinGroup.userData.head = head;

        // Halo ring
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(headSize * 1.1, headSize * 1.7, 20),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: pinGroup.userData.isMajor ? 0.5 : 0.3,
            side: THREE.DoubleSide
          })
        );
        halo.position.set(px, py, 0.12);
        pinGroup.add(halo);
        pinGroup.userData.halo = halo;

        // Ground dot
        const groundDot = new THREE.Mesh(
          new THREE.CircleGeometry(headSize * 0.6, 16),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.6 })
        );
        groundDot.position.set(px, py, 0.002);
        pinGroup.add(groundDot);

        // Label (minimal style, matching district labels)
        const label = this._makeLabelSprite(city.name, colorHex, {
          fontSize: 16, worldScale: 0.004
        });
        label.position.set(px, py, 0.25);
        // Only major cities have labels visible initially
        label.visible = pinGroup.userData.isMajor;
        pinGroup.add(label);
        pinGroup.userData.label = label;

        pinGroup.userData.basePhase = Math.random() * Math.PI * 2;
        pinGroup.userData.name = city.name;
        inner.add(pinGroup);
        this.cityPins.push({ group: pinGroup, name: city.name, city });
      });

      console.log(`[cities] Rendered ${enriched.length} pins (${majorSet.size} labeled) in district ${districtName}`);
    }

    /** Highlight the selected city pin */
    highlightCity(cityName) {
      const target = cityName.toLowerCase();
      this.cityPins.forEach(p => {
        const isTarget = p.name && p.name.toLowerCase() === target;
        const head = p.group.userData.head;
        const halo = p.group.userData.halo;
        if (isTarget) {
          // Make this pin bigger and brighter
          tween(p.group.scale, { x: 1.6, y: 1.6, z: 1.6 }, 500, easeOutCubic);
          if (head) head.material.color = new THREE.Color(0xffffff);
          if (halo) halo.material.opacity = 0.95;
        } else {
          tween(p.group.scale, { x: 0.85, y: 0.85, z: 0.85 }, 500, easeOutCubic);
          if (halo) halo.material.opacity = 0.4;
        }
      });
    }

    _buildCityPin(x, y, color, city) {
      const g = new THREE.Group();
      const c = new THREE.Color(color);
      const colorHex = '#' + color.toString(16).padStart(6, '0');

      // ── Small pin marker (teardrop-style head on short stem) ──
      // Short vertical stem
      const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.18, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(x, y, 0.09);
      stem.rotation.x = Math.PI / 2;
      g.add(stem);

      // Pin head — sphere on top of stem, colored by AQI
      const headGeo = new THREE.SphereGeometry(0.07, 16, 16);
      const headMat = new THREE.MeshBasicMaterial({ color: c });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(x, y, 0.22);
      g.add(head);

      // Outer glow halo around the pin head
      const haloGeo = new THREE.RingGeometry(0.08, 0.12, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.5, side: THREE.DoubleSide
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(x, y, 0.22);
      g.add(halo);

      // Ground dot at the pin's base
      const groundDotGeo = new THREE.CircleGeometry(0.035, 16);
      const groundDotMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7 });
      const groundDot = new THREE.Mesh(groundDotGeo, groundDotMat);
      groundDot.position.set(x, y, 0.002);
      g.add(groundDot);

      // ── Name label with AQI color swatch — small, minimal ─────────────────
      const label = this._makeLabelSprite(
        city.name,
        colorHex,
        { fontSize: 16, worldScale: 0.004 }
      );
      label.position.set(x, y, 0.45);
      g.add(label);

      // Animate refs
      g.userData = { halo, head, label, basePhase: Math.random() * Math.PI * 2, city };
      return g;
    }

    // ─── FADE HELPER ─────────────────────────────────────────────
    _fadeGroup(group, from, to, duration, onComplete) {
      // Collect all materials to fade
      const mats = [];
      group.traverse(obj => {
        if (obj.material) {
          if (Array.isArray(obj.material)) mats.push(...obj.material);
          else mats.push(obj.material);
        }
      });
      // Save each material's original opacity as the maximum target (only once)
      mats.forEach(m => {
        if (!m) return;
        m.transparent = true;
        if (m.userData._originalOpacity == null) m.userData._originalOpacity = m.opacity;
      });
      // Apply starting opacity immediately
      mats.forEach(m => {
        if (m) m.opacity = from * (m.userData._originalOpacity || 1);
      });
      // Animate from → to over duration using RAF
      const startTime = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - startTime) / duration);
        const eased = easeInOutCubic(p);
        const current = from + (to - from) * eased;
        mats.forEach(m => {
          if (m) m.opacity = current * (m.userData._originalOpacity || 1);
        });
        if (p < 1) {
          requestAnimationFrame(step);
        } else if (onComplete) {
          onComplete();
        }
      };
      requestAnimationFrame(step);
    }

    // ═══════════════════════════════════════════════════════════════
    // ─── MAIN RENDER LOOP ──────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════
    _animate() {
      requestAnimationFrame(() => this._animate());
      const now = performance.now();
      const t = this.clock.getElapsedTime();

      updateTweens(now);

      // Auto-rotate earth ONLY in hero/world mode AND when user isn't dragging it
      if (this.mode === 'world' && !this._userRotatingWorld) {
        this.worldGroup.rotation.y += 0.0015;
      }

      // Procedural nebula shader: animate time uniform for drifting clouds
      if (this.skyMat && this.skyMat.uniforms) {
        this.skyMat.uniforms.uTime.value = t;
      }
      // Very subtle rotation of the whole galaxy for extra life
      if (this.galaxyGroup) {
        this.galaxyGroup.rotation.y += 0.00008;
      }

      // Camera parallax in world/india mode
      if (this.mode === 'world') {
        this.camera.position.x += (this.mouseX * 2 - this.camera.position.x) * 0.03;
        this.camera.position.y += (-this.mouseY * 1.5 - this.camera.position.y) * 0.03;
      }
      this.camera.lookAt(this.cameraTarget);

      // Animate city pins (halo pulse + gentle head bob)
      // Also: progressively reveal minor-city labels as user zooms in
      const camZ = this.camera.position.z;
      // When cam z is <= ~3.5, show ALL labels. When >= 5.5, show only major ones.
      // Smooth interpolation inbetween.
      const showAllLabels = camZ <= 3.5;
      const showMajorOnly = camZ >= 5.5;
      this.cityPins.forEach((p, i) => {
        const halo = p.group.userData.halo;
        const head = p.group.userData.head;
        const label = p.group.userData.label;
        const isMajor = p.group.userData.isMajor;
        const phase = p.group.userData.basePhase || 0;
        if (halo) {
          const s = 1 + 0.4 * ((Math.sin(t * 2 + phase) + 1) / 2);
          halo.scale.set(s, s, s);
        }
        if (head) {
          head.scale.setScalar(1 + 0.1 * Math.sin(t * 2.5 + i));
        }
        // Zoom-based label visibility
        if (label) {
          if (showAllLabels) label.visible = true;
          else if (showMajorOnly) label.visible = !!isMajor;
          else {
            // Between 3.5 and 5.5: fade minor labels in proportionally
            label.visible = isMajor || (camZ < 4.5);
          }
        }
      });

      // Keep sun direction synced
      if (this.earthMat && this.earthMat.userData.shader) {
        this.earthMat.userData.shader.uniforms.sunDirection.value.copy(new THREE.Vector3(1, 0.3, 0.7).normalize());
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── GLOBAL EXPORT ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════
  window.IndiaGlobe = IndiaGlobe;
  window.IndiaGlobeUtils = { aqiColor, normalizeName, stateSlug, GEO_BASE, INDIA_URL, STATE_URL };
})();
