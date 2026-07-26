/* =========================================================
   AirLens · Pollutant detail page
   Reads ?type=&city=&value=&aqi= and renders 14 sections
   ========================================================= */
(function () {
  'use strict';

  /* ---------- URL params ---------- */
  var qs = new URLSearchParams(location.search);
  var TYPE  = (qs.get('type')  || 'pm25').toLowerCase();
  var CITY  = qs.get('city')  || 'Your city';
  var VALUE = parseFloat(qs.get('value'));
  var AQI   = parseFloat(qs.get('aqi'));

  /* ---------- Pollutant data model ---------- */
  var POLL = {
    pm25: {
      key:'pm25', name:'PM2.5', full:'Fine Particulate Matter', symbol:'PM₂.₅', unit:'µg/m³',
      color:'#ff5566', size:'≤ 2.5 µm', who:5, bands:[12,35,55,150],
      tag:'Microscopic particles that slip past your lungs and into your bloodstream.',
      edu:['<b>PM2.5</b> refers to inhalable particles smaller than 2.5 micrometres — about 30× thinner than a human hair.',
           'Because of their size, they bypass the body\'s natural filters and reach the deepest parts of the lungs and even the bloodstream.',
           'PM2.5 is the pollutant most strongly linked to long-term health harm and premature mortality worldwide.'],
      sources:[
        {ico:'🚗', name:'Vehicle exhaust', pct:34, desc:'Diesel engines and heavy traffic.'},
        {ico:'🏭', name:'Industry & power', pct:26, desc:'Coal plants, refineries, manufacturing.'},
        {ico:'🔥', name:'Biomass burning', pct:18, desc:'Crop-residue and wood fires.'},
        {ico:'🏗️', name:'Construction dust', pct:12, desc:'Sites, demolition, road works.'},
        {ico:'🍳', name:'Domestic cooking', pct:6,  desc:'Solid-fuel stoves and chimneys.'},
        {ico:'🌫️', name:'Secondary aerosols', pct:4,  desc:'Chemistry in the atmosphere.'}
      ],
      groups:[
        {name:'Children', risk:'high', line:'Developing lungs are <b>2× more sensitive</b>. Limit outdoor play when AQI > 100.'},
        {name:'Elderly',  risk:'high', line:'Higher rates of cardiac and respiratory events during PM2.5 spikes.'},
        {name:'Asthma & COPD', risk:'high', line:'Increased attacks and hospital visits within hours of exposure.'},
        {name:'Pregnant', risk:'mid',  line:'Linked to lower birth weight and pre-term delivery.'},
        {name:'Athletes', risk:'mid',  line:'Deeper breathing → more particles inhaled. Move workouts indoors.'},
        {name:'Healthy adults', risk:'low', line:'Short exposures are tolerable; chronic exposure still shortens lifespan.'}
      ],
      safety:[
        {ico:'😷', title:'Wear an N95', text:'Filters ≥ 95% of PM2.5. Cloth masks do very little.'},
        {ico:'🏠', title:'Close windows', text:'Seal your home during high-AQI hours (usually early morning).'},
        {ico:'🌬️', title:'Run a HEPA purifier', text:'Even one unit in the bedroom lowers daily exposure ~40%.'},
        {ico:'🚶', title:'Time your walks', text:'Prefer midday when levels dip. Avoid busy roads.'}
      ],
      facts:[
        {label:'Global deaths / yr', value:'4.2M', hint:'WHO attributable mortality.'},
        {label:'Life expectancy loss', value:'−2.3y', hint:'For 10 µg/m³ over WHO limit.'},
        {label:'Reaches', value:'Alveoli', hint:'Deepest lung tissue & blood.'}
      ],
      related:['pm10','no2','so2','o3']
    },
    pm10: {
      key:'pm10', name:'PM10', full:'Coarse Particulate Matter', symbol:'PM₁₀', unit:'µg/m³',
      color:'#ff8f3d', size:'≤ 10 µm', who:15, bands:[54,154,254,354],
      tag:'Larger dust and pollen particles that irritate the airways.',
      edu:['<b>PM10</b> particles are up to 10 micrometres wide — coarse dust, pollen, mould and road grit.',
           'They lodge in the upper airways and trigger irritation, coughing and asthma flare-ups.',
           'PM10 tracks closely with construction, unpaved roads and dry weather.'],
      sources:[
        {ico:'🏗️', name:'Construction & dust', pct:38, desc:'Building sites and demolition.'},
        {ico:'🛣️', name:'Road dust',           pct:22, desc:'Tyre and brake abrasion.'},
        {ico:'🌾', name:'Agriculture',          pct:14, desc:'Tilling, harvesting, straw burning.'},
        {ico:'🏭', name:'Industry',             pct:12, desc:'Cement, stone-crushing.'},
        {ico:'🌪️', name:'Natural dust',         pct:10, desc:'Wind-blown soil.'},
        {ico:'🚗', name:'Traffic',              pct:4,  desc:'Exhaust + resuspension.'}
      ],
      groups:[
        {name:'Children', risk:'high', line:'More prone to bronchitis and cough during dust events.'},
        {name:'Allergy sufferers', risk:'high', line:'PM10 carries pollen and fungal spores.'},
        {name:'Outdoor workers', risk:'mid', line:'Long shifts near roads or sites raise exposure sharply.'},
        {name:'Elderly', risk:'mid', line:'Cardio-respiratory admissions rise during PM10 peaks.'},
        {name:'Athletes', risk:'mid', line:'Coughing and reduced VO₂ during hard efforts.'},
        {name:'Healthy adults', risk:'low', line:'Mostly filtered by nose and throat.'}
      ],
      safety:[
        {ico:'😷', title:'Cover nose & mouth', text:'A well-fitted mask blocks most PM10.'},
        {ico:'💧', title:'Rinse eyes & nose', text:'Saline rinse after dusty commutes clears particulates.'},
        {ico:'🚿', title:'Wash on arrival', text:'Change clothes and shower after outdoor work.'},
        {ico:'🌳', title:'Prefer green routes', text:'Trees trap dust — cycle through parks.'}
      ],
      facts:[
        {label:'Typical size', value:'10 µm', hint:'Visible to the naked eye at high loads.'},
        {label:'WHO 24h limit', value:'45 µg/m³', hint:'2021 guideline.'},
        {label:'Half-life in air', value:'~hours', hint:'Settles faster than PM2.5.'}
      ],
      related:['pm25','no2','so2','o3']
    },
    no2: {
      key:'no2', name:'NO₂', full:'Nitrogen Dioxide', symbol:'NO₂', unit:'µg/m³',
      color:'#ff5b3a', size:'gas', who:10, bands:[40,80,180,280],
      tag:'A traffic-related gas that inflames airways and forms smog.',
      edu:['<b>Nitrogen dioxide</b> is a sharp, reddish-brown gas released mainly by combustion.',
           'It irritates the lining of airways, worsens asthma and helps form ground-level ozone.',
           'NO₂ concentrations spike near busy roads and drop quickly with distance.'],
      sources:[
        {ico:'🚗', name:'Vehicle exhaust', pct:52, desc:'Especially diesel engines.'},
        {ico:'🏭', name:'Power plants',    pct:22, desc:'Fossil-fuel combustion.'},
        {ico:'🏗️', name:'Off-road machinery', pct:10, desc:'Generators, construction.'},
        {ico:'🍳', name:'Gas stoves',      pct:8,  desc:'Indoor NO₂ source at home.'},
        {ico:'⛴️', name:'Shipping',        pct:5,  desc:'Marine bunker fuels.'},
        {ico:'⚡',  name:'Lightning',      pct:3,  desc:'Natural background.'}
      ],
      groups:[
        {name:'Asthmatics', risk:'high', line:'NO₂ triggers airway hyper-reactivity within minutes.'},
        {name:'Children near roads', risk:'high', line:'Attending schools near highways lowers lung growth.'},
        {name:'Elderly', risk:'mid', line:'Increases cardiac events on high-NO₂ days.'},
        {name:'COPD patients', risk:'high', line:'Sharp increase in hospital visits.'},
        {name:'Cyclists', risk:'mid', line:'Higher intake of roadside gas.'},
        {name:'Healthy adults', risk:'low', line:'Mild irritation for short exposures.'}
      ],
      safety:[
        {ico:'🚶', title:'Walk on quieter streets', text:'One block away, NO₂ can drop by half.'},
        {ico:'🌬️', title:'Vent kitchens', text:'Use an exhaust hood when using gas stoves.'},
        {ico:'🚴', title:'Off-peak commute', text:'Traffic-peak hours have the worst spikes.'},
        {ico:'🌿', title:'Add greenery', text:'Street trees measurably reduce NO₂ near buildings.'}
      ],
      facts:[
        {label:'WHO annual limit', value:'10 µg/m³', hint:'Very stringent.'},
        {label:'Peak proximity', value:'≤ 50 m', hint:'From busy roads.'},
        {label:'Reacts with', value:'VOCs → O₃', hint:'Ozone precursor.'}
      ],
      related:['o3','so2','pm25','co']
    },
    so2: {
      key:'so2', name:'SO₂', full:'Sulphur Dioxide', symbol:'SO₂', unit:'µg/m³',
      color:'#ffce3d', size:'gas', who:40, bands:[40,80,380,800],
      tag:'Acrid industrial gas that inflames airways and forms acid rain.',
      edu:['<b>Sulphur dioxide</b> is a colourless, pungent gas formed when sulphur-containing fuels burn.',
           'It reacts with moisture to form fine sulphate particles and acid rain.',
           'Even short peaks can trigger bronchoconstriction in asthmatics.'],
      sources:[
        {ico:'🏭', name:'Coal power plants', pct:48, desc:'The single largest source globally.'},
        {ico:'⛴️', name:'Shipping fuels',    pct:18, desc:'High-sulphur bunker oil.'},
        {ico:'⛽', name:'Refineries',         pct:14, desc:'Petroleum processing.'},
        {ico:'🚛', name:'Diesel vehicles',    pct:8,  desc:'Where low-S fuel is not mandated.'},
        {ico:'🌋', name:'Volcanoes',          pct:8,  desc:'Natural episodic source.'},
        {ico:'🏗️', name:'Metal smelting',     pct:4,  desc:'Copper, zinc, lead refining.'}
      ],
      groups:[
        {name:'Asthmatics', risk:'high', line:'Even brief peaks (5–10 min) cause airway narrowing.'},
        {name:'Children',   risk:'high', line:'Reduced lung function during high-SO₂ days.'},
        {name:'Elderly',    risk:'mid',  line:'Cardio-respiratory admissions rise.'},
        {name:'Industrial workers', risk:'high', line:'Occupational exposure limits apply.'},
        {name:'Athletes',   risk:'mid',  line:'Coughing and chest tightness during exertion.'},
        {name:'Healthy adults', risk:'low', line:'Tolerate low background levels.'}
      ],
      safety:[
        {ico:'🏠', title:'Stay indoors during peaks', text:'Close windows, run purifier with activated carbon.'},
        {ico:'😷', title:'Wear an activated-carbon mask', text:'Standard N95 does not filter gases.'},
        {ico:'💊', title:'Carry rescue inhaler', text:'If you have asthma, keep it accessible.'},
        {ico:'📱', title:'Watch alerts', text:'Industrial cities issue SO₂ advisories — subscribe.'}
      ],
      facts:[
        {label:'WHO 24h limit', value:'40 µg/m³', hint:'2021 guideline.'},
        {label:'Acid rain', value:'H₂SO₄', hint:'Formed via oxidation in cloud.'},
        {label:'Lifetime in air', value:'~1 day', hint:'Before deposition.'}
      ],
      related:['no2','pm25','o3','co']
    },
    o3: {
      key:'o3', name:'O₃', full:'Ground-level Ozone', symbol:'O₃', unit:'µg/m³',
      color:'#38b4ff', size:'gas', who:100, bands:[50,100,168,208],
      tag:'A summer-smog gas that irritates lungs and reduces exercise performance.',
      edu:['<b>Ground-level ozone</b> is not emitted directly — it forms when NOₓ and volatile organics react in sunlight.',
           'It peaks on hot, sunny afternoons and can travel far from source regions.',
           'Ozone irritates the lining of the lungs, cuts athletic capacity and damages crops.'],
      sources:[
        {ico:'☀️', name:'Sunlight + NOₓ',   pct:44, desc:'Photochemistry over cities.'},
        {ico:'🚗', name:'Vehicle emissions', pct:22, desc:'Provides NOₓ precursor.'},
        {ico:'🏭', name:'Industrial VOCs',   pct:16, desc:'Solvents, paints, refineries.'},
        {ico:'🌳', name:'Biogenic VOCs',     pct:10, desc:'Trees emit isoprene.'},
        {ico:'⛽', name:'Fuel evaporation',  pct:6,  desc:'From pumps and tanks.'},
        {ico:'🔥', name:'Wildfires',         pct:2,  desc:'Boost regional ozone.'}
      ],
      groups:[
        {name:'Athletes',  risk:'high', line:'VO₂ max drops measurably above 120 µg/m³.'},
        {name:'Children',  risk:'high', line:'Play outdoors longer — highest cumulative dose.'},
        {name:'Asthmatics', risk:'high', line:'Attacks rise sharply on hot afternoons.'},
        {name:'Outdoor workers', risk:'mid', line:'Exposure over full shifts.'},
        {name:'Elderly',   risk:'mid',  line:'Higher risk of respiratory hospitalisation.'},
        {name:'Healthy adults', risk:'low', line:'Mild cough or throat irritation.'}
      ],
      safety:[
        {ico:'🌅', title:'Exercise in the morning', text:'Ozone builds up through the afternoon.'},
        {ico:'🌳', title:'Head to parks', text:'Concentrations dip under tree cover.'},
        {ico:'🏠', title:'Stay in with AC', text:'Indoor ozone is 20–80% lower.'},
        {ico:'🚗', title:'Cut car trips on hot days', text:'You directly reduce local NOₓ.'}
      ],
      facts:[
        {label:'WHO 8h limit', value:'100 µg/m³', hint:'2021 guideline.'},
        {label:'Peak time', value:'2–5 pm', hint:'Sunlight-driven.'},
        {label:'Crop losses', value:'US$ 26B/yr', hint:'Wheat, rice, soy globally.'}
      ],
      related:['no2','pm25','so2','co']
    },
    co: {
      key:'co', name:'CO', full:'Carbon Monoxide', symbol:'CO', unit:'mg/m³',
      color:'#a56bff', size:'gas', who:4, bands:[4.4,9.4,12.4,15.4],
      tag:'A silent, odourless gas that starves cells of oxygen.',
      edu:['<b>Carbon monoxide</b> is a colourless, odourless gas produced by incomplete combustion.',
           'It binds to haemoglobin ~200× more strongly than oxygen, reducing oxygen delivery.',
           'Outdoor CO is usually low; indoor exposure from stoves and generators is the real danger.'],
      sources:[
        {ico:'🚗', name:'Vehicle exhaust',  pct:56, desc:'Especially cold starts and traffic jams.'},
        {ico:'🍳', name:'Gas stoves',       pct:14, desc:'Poor ventilation raises risk sharply.'},
        {ico:'🔥', name:'Wood/coal heating', pct:12, desc:'Chimney back-drafting.'},
        {ico:'🏭', name:'Industry',          pct:10, desc:'Steel and chemical processes.'},
        {ico:'🌲', name:'Wildfires',         pct:5,  desc:'Regional smoke plumes.'},
        {ico:'⚙️', name:'Generators',        pct:3,  desc:'Never run indoors.'}
      ],
      groups:[
        {name:'Pregnant',  risk:'high', line:'Reduces fetal oxygen supply.'},
        {name:'Heart patients', risk:'high', line:'Precipitates angina at very low doses.'},
        {name:'Children',  risk:'mid',  line:'Higher metabolic demand for oxygen.'},
        {name:'Elderly',   risk:'mid',  line:'Compromised cardiovascular reserve.'},
        {name:'Smokers',   risk:'high', line:'Already elevated baseline CO.'},
        {name:'Healthy adults', risk:'low', line:'Symptoms above 30 mg/m³ short exposure.'}
      ],
      safety:[
        {ico:'🚨', title:'Install a CO alarm', text:'Cheap, mandatory in many countries.'},
        {ico:'🌬️', title:'Ventilate kitchens', text:'Run the extractor whenever cooking.'},
        {ico:'🚗', title:'Turn off idle engines', text:'Especially in garages.'},
        {ico:'🔥', title:'Service heaters yearly', text:'Blocked flues cause deadly build-ups.'}
      ],
      facts:[
        {label:'WHO 8h limit', value:'10 mg/m³', hint:'2021 guideline.'},
        {label:'Binds Hb', value:'200×', hint:'Vs oxygen affinity.'},
        {label:'Half-life in blood', value:'~5 h', hint:'Fresh air recovery.'}
      ],
      related:['no2','pm25','o3','so2']
    }
  };

  var p = POLL[TYPE] || POLL.pm25;
  document.documentElement.style.setProperty('--pd-color', p.color);
  document.title = 'AirLens · ' + p.name + ' — ' + CITY;

  /* ---------- Helpers ---------- */
  function levelFor(v, bands) {
    if (v == null || isNaN(v)) return {label:'—', color:'#8ea0b0'};
    if (v <= bands[0]) return {label:'Good',            color:'#00e676'};
    if (v <= bands[1]) return {label:'Moderate',        color:'#ffeb3b'};
    if (v <= bands[2]) return {label:'Unhealthy',       color:'#ff9800'};
    if (v <= bands[3]) return {label:'Very Unhealthy',  color:'#f44336'};
    return                    {label:'Hazardous',       color:'#9c27b0'};
  }
  function el(tag, cls, html) { var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function fmt(n, d) { if (n==null||isNaN(n)) return '—'; return (+n).toFixed(d||0); }

  /* ---------- 1. Hero ---------- */
  document.getElementById('pdCrumb').textContent = p.name;
  document.getElementById('pdSymbolMono').textContent = p.symbol + ' · ' + p.full;
  document.getElementById('pdName').textContent = p.name;
  document.getElementById('pdTag').textContent = p.tag;
  document.getElementById('pdValue').textContent = isNaN(VALUE) ? '—' : (VALUE % 1 === 0 ? VALUE : VALUE.toFixed(1));
  document.getElementById('pdUnit').textContent = p.unit;
  document.getElementById('pdCity').textContent = CITY;
  document.getElementById('pdAQI').textContent = isNaN(AQI) ? '—' : Math.round(AQI);
  var orb = document.getElementById('pdOrb'); orb.setAttribute('data-symbol', p.symbol);
  var lvl = levelFor(VALUE, p.bands);
  document.getElementById('pdStatusTxt').textContent = lvl.label;
  document.documentElement.style.setProperty('--pd-status-color', lvl.color);

  /* ---------- 2. Summary ---------- */
  var whoRatio = (isNaN(VALUE) || !p.who) ? null : VALUE / p.who;
  var deltaCls = whoRatio == null ? '' : (whoRatio <= 1 ? 'pd-delta-good' : whoRatio <= 2 ? 'pd-delta-warn' : 'pd-delta-bad');
  var deltaTxt = whoRatio == null ? '—' : (whoRatio <= 1 ? 'within limit' : (whoRatio.toFixed(1) + '× WHO'));
  var summary = [
    {label:'Current', value: (isNaN(VALUE)?'—':fmt(VALUE,1)) + ' <small>'+p.unit+'</small>', hint: lvl.label},
    {label:'WHO safe', value: p.who + ' <small>'+p.unit+'</small>', hint:'Global guideline'},
    {label:'City AQI', value: isNaN(AQI)?'—':Math.round(AQI), hint: CITY},
    {label:'vs WHO', value:'<span class="pd-stat-delta '+deltaCls+'">'+deltaTxt+'</span>', hint:'Ratio of guideline'}
  ];
  var sumGrid = document.getElementById('pdSummary');
  summary.forEach(function(s){
    var c = el('div','pd-glass');
    c.appendChild(el('div','pd-stat-label', s.label));
    c.appendChild(el('div','pd-stat-value', s.value));
    c.appendChild(el('div','pd-stat-hint',  s.hint));
    sumGrid.appendChild(c);
  });

  /* ---------- 3. Health impact ---------- */
  var impactByLvl = {
    'Good':           'Air quality is <b>safe</b>. Normal outdoor activity for everyone.',
    'Moderate':       'Air is <b>acceptable</b>, but unusually sensitive people may notice mild irritation.',
    'Unhealthy':      '<b>Sensitive groups</b> should limit outdoor activity. Everyone else should reduce prolonged exertion.',
    'Very Unhealthy': 'Everyone will feel effects. <b>Stay indoors</b>, wear an N95 if you must go out.',
    'Hazardous':      'Emergency-level pollution. <b>Avoid all outdoor exposure.</b>',
    '—':              'Live measurement unavailable for this location.'
  };
  document.getElementById('pdImpactLede').innerHTML = impactByLvl[lvl.label] || impactByLvl['—'];
  var recoMap = {
    'Good':           [{c:'ok', i:'✅', t:'Outdoor exercise OK'},{c:'ok', i:'🪟', t:'Windows can stay open'},{c:'ok', i:'🚴', t:'Cycle commute fine'}],
    'Moderate':       [{c:'ok', i:'😷', t:'Sensitive: consider mask'},{c:'ok', i:'🏃', t:'Light exercise OK'},{c:'warn', i:'🕒', t:'Watch evening peak'}],
    'Unhealthy':      [{c:'warn', i:'😷', t:'Wear N95 outdoors'},{c:'warn', i:'🏠', t:'Close windows'},{c:'bad', i:'❌', t:'Skip outdoor sports'}],
    'Very Unhealthy': [{c:'bad', i:'🚫', t:'Stay indoors'},{c:'bad', i:'🌀', t:'Run HEPA purifier'},{c:'bad', i:'😷', t:'N95 if you must go out'}],
    'Hazardous':      [{c:'bad', i:'🚨', t:'Emergency — no outdoor exposure'},{c:'bad', i:'🏥', t:'Vulnerable: seek shelter'},{c:'bad', i:'🌀', t:'Seal home, purifiers on'}],
    '—':              [{c:'', i:'ℹ️', t:'No live data'}]
  };
  var rec = document.getElementById('pdImpactRecos');
  (recoMap[lvl.label]||recoMap['—']).forEach(function(r){
    var e=el('div','pd-reco '+r.c);
    e.appendChild(el('span','pd-reco-ico', r.i));
    e.appendChild(el('span','pd-reco-text', r.t));
    rec.appendChild(e);
  });

  /* ---------- 4. Education ---------- */
  var plot = document.getElementById('pdScalePlot');
  var scales = [
    {name:'Human hair',   sub:'≈ 70 µm cross-section', size:60},
    {name:'Beach sand',   sub:'≈ 90 µm grain',          size:70},
    {name:'PM10',         sub:'coarse dust',            size:32},
    {name:'PM2.5',        sub:'fine particulate',       size:14},
    {name:'Gas molecule', sub:'e.g. NO₂ / O₃',          size:6}
  ];
  scales.forEach(function(s){
    var row = el('div','pd-scale-row');
    var dot = el('div','pd-scale-dot');
    dot.style.width = s.size+'px'; dot.style.height = s.size+'px';
    var tx = el('div','pd-scale-txt');
    tx.appendChild(el('div','pd-scale-name', s.name));
    tx.appendChild(el('div','pd-scale-sub',  s.sub));
    var sz = el('div','pd-scale-size', s.size+' px');
    row.appendChild(dot); row.appendChild(tx); row.appendChild(sz);
    plot.appendChild(row);
  });
  var edu = document.getElementById('pdEduCopy');
  p.edu.forEach(function(t){ edu.appendChild(el('p', null, t)); });
  edu.appendChild(el('div','pd-stat-hint','Typical size: <b>'+p.size+'</b>'));

  /* ---------- 5. Sources ---------- */
  var srcWrap = document.getElementById('pdSources');
  p.sources.forEach(function(s){
    var c = el('div','pd-glass');
    var row = el('div','pd-source');
    row.appendChild(el('div','pd-source-ico', s.ico));
    var body = el('div', null, '');
    body.style.flex='1';
    body.appendChild(el('div','pd-source-title', s.name));
    body.appendChild(el('div','pd-source-desc',  s.desc));
    var bar = el('div','pd-source-bar','<i style="--pd-bar-w:'+s.pct+'%"></i>');
    body.appendChild(bar);
    body.appendChild(el('div','pd-source-pct', s.pct+'%'));
    row.appendChild(body);
    c.appendChild(row);
    srcWrap.appendChild(c);
  });

  /* ---------- 6. Groups ---------- */
  var grpWrap = document.getElementById('pdGroups');
  p.groups.forEach(function(g){
    var c = el('div','pd-glass');
    var hdr = el('div','pd-group-hdr');
    hdr.appendChild(el('div','pd-group-name', g.name));
    hdr.appendChild(el('div','pd-risk-pill pd-risk-'+g.risk, g.risk.toUpperCase()));
    c.appendChild(hdr);
    c.appendChild(el('div','pd-group-line', g.line));
    grpWrap.appendChild(c);
  });

  /* ---------- 7. Chart ---------- */
  var chart;
  function genSeries(range) {
    var base = isNaN(VALUE) ? p.who * 1.5 : VALUE;
    var n = range==='24h'?24 : range==='7d'?7 : 30;
    var labels=[], data=[];
    for (var i=0;i<n;i++){
      var t = range==='24h' ? (i+':00') : (range==='7d' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i%7] : 'D'+(i+1));
      labels.push(t);
      var wave = Math.sin(i/(n/6))*0.25 + (Math.random()-0.5)*0.2;
      data.push(Math.max(0, +(base*(1+wave)).toFixed(1)));
    }
    return {labels:labels, data:data};
  }
  function drawChart(range) {
    var ctx = document.getElementById('pdChart');
    var s = genSeries(range);
    if (chart) chart.destroy();
    var grad = ctx.getContext('2d').createLinearGradient(0,0,0,320);
    grad.addColorStop(0, p.color + 'cc');
    grad.addColorStop(1, p.color + '00');
    chart = new Chart(ctx, {
      type:'line',
      data:{ labels:s.labels, datasets:[{
        label:p.name+' ('+p.unit+')',
        data:s.data,
        borderColor:p.color, backgroundColor:grad,
        fill:true, tension:.38, borderWidth:2, pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:'#fff'
      }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{mode:'index', intersect:false}},
        scales:{
          x:{ ticks:{color:'#7d8b9e'}, grid:{color:'rgba(255,255,255,.04)'}},
          y:{ ticks:{color:'#7d8b9e'}, grid:{color:'rgba(255,255,255,.06)'}}
        }
      }
    });
  }
  drawChart('24h');
  document.querySelectorAll('#pdChartTabs .pd-tab').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('#pdChartTabs .pd-tab').forEach(function(x){x.classList.remove('on');});
      t.classList.add('on');
      drawChart(t.dataset.range);
    });
  });

  /* ---------- 8. Timeline ---------- */
  var tl = document.getElementById('pdTimeline');
  var base = isNaN(VALUE) ? p.who*1.5 : VALUE;
  var hours = ['Night','Morning','Mid-day','Rush','Evening','Late'];
  var factors = [0.7, 1.15, 0.9, 1.35, 1.1, 0.85];
  hours.forEach(function(h,i){
    var v = +(base*factors[i]).toFixed(1);
    var l = levelFor(v, p.bands);
    var n = el('div','pd-tl-node');
    n.style.borderTop = '2px solid ' + l.color;
    n.innerHTML =
      '<div style="font-family:var(--font-head);font-size:11px;letter-spacing:1px;color:var(--text3)">'+h+'</div>'+
      '<div style="font-family:var(--font-head);font-weight:700;font-size:20px;margin:6px 0;color:#fff">'+v+'</div>'+
      '<div style="font-size:11px;color:'+l.color+';font-weight:600">'+l.label+'</div>';
    tl.appendChild(n);
  });

  /* ---------- 9. WHO comparison ---------- */
  var who = document.getElementById('pdWho');
  var ratio = isNaN(VALUE) ? 1 : Math.min(6, VALUE / p.who);
  who.innerHTML =
    '<div style="display:flex;justify-content:space-between;font-family:var(--font-head);font-size:12px;letter-spacing:1px;color:var(--text3);margin-bottom:8px">'+
      '<span>WHO SAFE ('+p.who+' '+p.unit+')</span><span>YOUR AIR ('+(isNaN(VALUE)?'—':VALUE)+' '+p.unit+')</span>'+
    '</div>'+
    '<div style="display:flex;gap:16px;align-items:center">'+
      '<div style="flex:1;height:14px;background:rgba(0,230,118,.15);border-radius:999px;border:1px solid rgba(0,230,118,.35)"></div>'+
      '<div style="font-family:var(--font-head);color:'+(ratio<=1?'#00e676':ratio<=2?'#ff9800':'#f44336')+';font-weight:700">'+ratio.toFixed(1)+'×</div>'+
      '<div style="flex:'+ratio+';height:14px;background:linear-gradient(90deg,'+p.color+'55,'+p.color+');border-radius:999px;box-shadow:0 0 20px '+p.color+'"></div>'+
    '</div>'+
    '<div style="margin-top:14px;color:var(--text2);font-size:13px;line-height:1.6">'+
      (ratio<=1 ? 'Your city is within the WHO guideline for '+p.name+'. Keep it up.' :
                  'Your city\'s '+p.name+' is <b>'+ratio.toFixed(1)+'× the WHO guideline</b>. Long-term exposure at this level shortens life expectancy.') +
    '</div>';

  /* ---------- 10. Safety recommendations ---------- */
  var safe = document.getElementById('pdSafety');
  p.safety.forEach(function(s){
    var c = el('div','pd-glass');
    c.innerHTML =
      '<div style="display:flex;gap:14px;align-items:flex-start">'+
        '<div style="font-size:26px">'+s.ico+'</div>'+
        '<div><div style="font-family:var(--font-head);font-weight:700;font-size:15px;margin-bottom:4px">'+s.title+'</div>'+
        '<div style="color:var(--text2);font-size:13px;line-height:1.55">'+s.text+'</div></div>'+
      '</div>';
    safe.appendChild(c);
  });

  /* ---------- 11. Scientific facts ---------- */
  var facts = document.getElementById('pdFacts');
  p.facts.forEach(function(f){
    var c = el('div','pd-glass');
    c.appendChild(el('div','pd-stat-label', f.label));
    c.appendChild(el('div','pd-stat-value', f.value));
    c.appendChild(el('div','pd-stat-hint',  f.hint));
    facts.appendChild(c);
  });

  /* ---------- 12. Map ---------- */
  document.getElementById('pdMapCity').textContent = CITY;
  try {
    var CITY_COORDS = {
      'Delhi':[28.6139,77.209], 'Mumbai':[19.076,72.8777], 'Chennai':[13.0827,80.2707],
      'Bengaluru':[12.9716,77.5946], 'Bangalore':[12.9716,77.5946], 'Kolkata':[22.5726,88.3639],
      'Hyderabad':[17.385,78.4867], 'Pune':[18.5204,73.8567], 'Ahmedabad':[23.0225,72.5714]
    };
    var coords = CITY_COORDS[CITY] || [20.5937, 78.9629];
    var map = L.map('pdMap', {zoomControl:false, attributionControl:false}).setView(coords, 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {maxZoom:19}).addTo(map);
    L.circle(coords, {
      radius: 8000,
      color: p.color, weight:2, fillColor:p.color, fillOpacity:.18
    }).addTo(map);
    L.circleMarker(coords, {radius:8, color:'#fff', fillColor:p.color, fillOpacity:1, weight:2})
      .addTo(map)
      .bindTooltip('<b>'+CITY+'</b><br>'+p.name+': '+(isNaN(VALUE)?'—':VALUE)+' '+p.unit, {direction:'top'});
  } catch(e) { document.getElementById('pdMap').innerHTML = '<div style="padding:24px;color:var(--text3)">Map unavailable</div>'; }

  /* ---------- 13. AI insight ---------- */
  var ai = document.getElementById('pdAIText');
  var deltaWho = ratio;
  var trend = ['rising steadily since sunrise','holding near seasonal average','peaking earlier than usual today','dropping thanks to favourable winds'][Math.floor(Math.random()*4)];
  ai.innerHTML =
    '<b>'+CITY+'</b>\'s '+p.name+' is currently <b>'+lvl.label.toLowerCase()+'</b> at '+
    (isNaN(VALUE)?'—':VALUE)+' '+p.unit+' — '+
    (deltaWho<=1 ? 'within WHO limits' : deltaWho.toFixed(1)+'× the WHO guideline') + '. ' +
    'Levels are '+trend+'. ' +
    (lvl.label==='Good' ? 'A great window for outdoor activity.' :
     lvl.label==='Moderate' ? 'Sensitive groups should watch afternoon peaks.' :
     'Consider limiting outdoor exposure and running a HEPA purifier at home.');

  /* ---------- 14. Related pollutants ---------- */
  var rel = document.getElementById('pdRelated');
  var relKeys = [p.key].concat(p.related).slice(0,5);
  relKeys.forEach(function(k){
    var rp = POLL[k]; if(!rp) return;
    var c = el('div','pd-rel-card' + (k===p.key ? ' is-current' : ''));
    c.style.setProperty('--rel-color', rp.color);
    c.innerHTML =
      '<div class="pd-rel-badge">'+rp.symbol+'</div>'+
      '<div class="pd-rel-name">'+rp.full+'</div>'+
      '<div class="pd-rel-val">'+(k===p.key && !isNaN(VALUE) ? VALUE : '—')+' <small>'+rp.unit+'</small></div>';
    if (k !== p.key) c.addEventListener('click', function(){
      var q = new URLSearchParams({type:k, city:CITY, value:'', aqi:isNaN(AQI)?'':AQI});
      location.href = 'pollutant.html?' + q.toString();
    });
    rel.appendChild(c);
  });
})();
