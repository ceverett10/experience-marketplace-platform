export const COMBINED_EXPERIENCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Holibob Experiences</title>
<style>
  :root { --primary: #14B8A6; --primary-light: rgba(20,184,166,0.1); --primary-dark: #0D9488; --bg: #111827; --surface: rgba(255,255,255,0.05); --surface-hover: rgba(255,255,255,0.08); --surface-raised: rgba(255,255,255,0.07); --border: rgba(255,255,255,0.1); --border-hover: rgba(255,255,255,0.2); --text: #F5F7FA; --text-secondary: #D1D5DB; --text-muted: #9CA3AF; --text-dim: #6B7280; --yellow: #FACC15; --green: #4ADE80; --red: #F87171; --shadow-sm: 0 1px 3px rgba(0,0,0,0.3); --shadow: 0 4px 12px rgba(0,0,0,0.4); --shadow-lg: 0 8px 24px rgba(0,0,0,0.5); --radius: 12px; --card-w: 260px; --gap: 14px; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; line-height: 1.5; }

  /* === LOADING === */
  .loading-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .loading-overlay.active { opacity: 1; pointer-events: auto; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { font-size: 13px; font-weight: 600; color: var(--text-secondary); }

  /* === PLANNER === */
  .planner { padding: 16px; }
  .planner-collapsed { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; margin: 12px 16px 0; transition: all 0.15s; }
  .planner-collapsed:hover { border-color: var(--border-hover); background: var(--surface-hover); }
  .planner-collapsed .summary { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; line-height: 1.4; }
  .planner-collapsed .edit-btn { font-size: 12px; font-weight: 700; color: var(--primary); padding: 4px 10px; border-radius: 6px; background: var(--primary-light); }
  .progress { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 16px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); transition: all 0.25s; }
  .dot.active { background: var(--primary); width: 24px; border-radius: 4px; }
  .dot.done { background: var(--primary); }
  .section { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; overflow: hidden; transition: all 0.2s; background: var(--surface); }
  .section.active { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(20,184,166,0.1); }
  .section-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; user-select: none; }
  .section-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; background: rgba(255,255,255,0.05); flex-shrink: 0; transition: background 0.15s; }
  .section.active .section-icon { background: var(--primary-light); }
  .section-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; }
  .section-value { font-size: 13px; font-weight: 600; color: var(--text); margin-top: 2px; }
  .section-chevron { margin-left: auto; color: var(--text-dim); font-size: 16px; transition: transform 0.25s; }
  .section.active .section-chevron { transform: rotate(180deg); color: var(--primary); }
  .section-body { display: none; padding: 0 14px 14px; }
  .section.active .section-body { display: block; }
  .input-row { margin-bottom: 10px; }
  .input-row input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; color: var(--text); background: rgba(255,255,255,0.03); outline: none; transition: all 0.15s; }
  .input-row input::placeholder { color: var(--text-dim); }
  .input-row input:focus { border-color: var(--primary); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px rgba(20,184,166,0.12); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 7px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; background: transparent; color: var(--text-secondary); border: 1px solid var(--border); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .chip:hover { background: rgba(255,255,255,0.06); border-color: var(--border-hover); color: var(--text); }
  .chip.selected { background: var(--primary); color: white; border-color: var(--primary); }
  .cta { width: 100%; padding: 13px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 14px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 12px rgba(20,184,166,0.3); }
  .cta:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(20,184,166,0.4); }
  .cta:active { transform: translateY(0); }
  .cta:disabled { opacity: 0.3; cursor: not-allowed; transform: none; box-shadow: none; }
  .cta svg { width: 16px; height: 16px; }

  /* === CAROUSEL === */
  .carousel-section { display: none; padding: 16px; }
  .carousel-section.visible { display: block; }
  .carousel-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .carousel-header h3 { font-size: 16px; font-weight: 700; color: var(--text); }
  .carousel-header .count { font-size: 12px; color: var(--text-muted); font-weight: 500; }
  .carousel { position: relative; }
  .viewport { overflow: hidden; border-radius: 4px; }
  .track { display: flex; gap: var(--gap); transition: transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1); }
  .card { width: var(--card-w); flex-shrink: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); overflow: hidden; cursor: pointer; transition: all 0.2s; }
  .card:hover { box-shadow: var(--shadow-lg); transform: translateY(-3px); border-color: var(--border-hover); }
  .card-img { position: relative; width: 100%; aspect-ratio: 4/3; background: rgba(255,255,255,0.03); overflow: hidden; }
  .card-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
  .card:hover .card-img img { transform: scale(1.05); }
  .badge { position: absolute; top: 8px; left: 8px; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: var(--primary); color: white; letter-spacing: 0.3px; }
  .rating-badge { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 3px; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.5); color: white; backdrop-filter: blur(4px); }
  .star { color: var(--yellow); }
  .card-body { padding: 12px; }
  .card-title { font-size: 13px; font-weight: 700; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; min-height: 35px; color: var(--text); }
  .card-loc { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .card-loc svg { width: 11px; height: 11px; flex-shrink: 0; }
  .card-meta { font-size: 11px; color: var(--text-muted); display: flex; gap: 10px; margin-bottom: 8px; }
  .card-meta span { display: flex; align-items: center; gap: 3px; }
  .card-meta svg { width: 11px; height: 11px; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; padding: 0 12px 12px; }
  .price { font-size: 15px; font-weight: 700; color: var(--primary); }
  .price-label { font-size: 10px; color: var(--text-muted); font-weight: 400; }
  .view-btn { padding: 6px 12px; border-radius: 8px; border: 1.5px solid var(--primary); background: transparent; color: var(--primary); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .view-btn:hover { background: var(--primary); color: white; }
  .nav-btn { position: absolute; top: 50%; transform: translateY(-80%); width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); box-shadow: var(--shadow); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: all 0.15s; }
  .nav-btn:hover { background: var(--surface-hover); box-shadow: var(--shadow-lg); }
  .nav-btn.left { left: -12px; }
  .nav-btn.right { right: -12px; }
  .nav-btn.hidden { display: none; }
  .nav-btn svg { width: 14px; height: 14px; color: var(--text-secondary); }
  .load-more { width: var(--card-w); flex-shrink: 0; border: 2px dashed var(--border); border-radius: var(--radius); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; min-height: 240px; transition: all 0.2s; background: transparent; }
  .load-more:hover { border-color: var(--primary); background: var(--primary-light); }
  .load-more svg { width: 28px; height: 28px; color: var(--text-dim); transition: color 0.15s; }
  .load-more:hover svg { color: var(--primary); }
  .load-more span { font-size: 12px; font-weight: 600; color: var(--text-muted); transition: color 0.15s; }
  .load-more:hover span { color: var(--primary); }

  /* === DETAIL === */
  .detail-section { display: none; padding: 16px; }
  .detail-section.visible { display: block; }
  .back-link { font-size: 13px; color: var(--primary); font-weight: 600; cursor: pointer; margin-bottom: 14px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; }
  .back-link:hover { text-decoration: underline; }
  .back-link svg { width: 14px; height: 14px; }
  .detail-hero { width: 100%; height: 200px; border-radius: var(--radius); overflow: hidden; position: relative; background: rgba(255,255,255,0.03); margin-bottom: 16px; }
  .detail-hero img { width: 100%; height: 100%; object-fit: cover; }
  .detail-hero .overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; background: linear-gradient(transparent, rgba(0,0,0,0.75)); color: white; }
  .detail-hero .overlay h2 { font-size: 18px; font-weight: 700; line-height: 1.3; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 16px; font-size: 13px; color: var(--text-secondary); }
  .detail-meta span { display: flex; align-items: center; gap: 5px; }
  .detail-meta svg { width: 14px; height: 14px; }
  .detail-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
  .tab { padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; user-select: none; }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
  .tab:hover { color: var(--text-secondary); }
  .tab-content { display: none; font-size: 13px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 16px; min-height: 60px; }
  .tab-content.active { display: block; }
  .list-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; line-height: 1.5; }
  .list-item .icon-g { color: var(--green); flex-shrink: 0; font-weight: 700; }
  .list-item .icon-r { color: var(--red); flex-shrink: 0; font-weight: 700; }
  .review { padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
  .review-author { font-size: 12px; font-weight: 700; margin-bottom: 3px; color: var(--text); }
  .review-stars { color: var(--yellow); font-size: 12px; margin-bottom: 5px; }
  .review-text { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .cancel-policy { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--green); font-weight: 600; margin-bottom: 14px; padding: 8px 12px; background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.15); border-radius: 8px; }
  /* === CHAT HANDOFF === */
  .chat-handoff { margin-top: 16px; padding: 20px 16px; background: var(--primary-light); border: 1px solid rgba(20,184,166,0.15); border-radius: var(--radius); text-align: center; }
  .handoff-icon { font-size: 28px; margin-bottom: 8px; }
  .handoff-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .handoff-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px; }
  .handoff-suggestion { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.15s; max-width: 100%; }
  .handoff-suggestion:hover { border-color: var(--primary); background: var(--primary-light); }
  .suggestion-text { font-size: 13px; color: var(--primary); font-weight: 600; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .copy-icon { font-size: 14px; flex-shrink: 0; }

  /* === DIVIDER === */
  .section-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); margin: 0 16px; }
</style>
</head>
<body>
<div id="root"></div>
<div class="loading-overlay" id="loader"><div class="spinner"></div><div class="loading-text">Searching experiences...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  var loader = document.getElementById('loader');
  var state = {
    plannerExpanded: true,
    selections: { where: '', when: '', who: '', what: '' },
    activeIdx: 0,
    allChips: { where: ['London','Paris','Barcelona','Rome','Amsterdam','Edinburgh'], when: ['Today','Tomorrow','This Weekend','Next Week','Next Month'], who: ['Solo Traveller','Couple','Family with Kids','Group of Friends'], what: ['Walking Tours','Food & Drink','Museums','Outdoor Activities','Day Trips'] },
    experiences: [],
    seenIds: {},
    destination: '',
    hasMore: false,
    carouselIdx: 0,
    detail: null,
    activeTab: 'desc',
    loading: false
  };
  var sKeys = ['where','when','who','what'];
  var sLabels = ['Where','When','Who','What'];
  var sIcons = ['\\u{1F4CD}','\\u{1F4C5}','\\u{1F465}','\\u{2728}'];
  var sPlaceholders = ['Type a destination...','When are you going?','Who is travelling?','What do you want to do?'];

  window.onerror = function() { return true; };
  window.addEventListener('unhandledrejection', function(e) { e.preventDefault(); });

  // === JSON-RPC bridge ===
  var rpcId = 0;
  var pending = {};
  var bridgeReady = new Promise(function(resolve) { window._bridgeResolve = resolve; });

  function rpcRequest(method, params) {
    return new Promise(function(resolve, reject) {
      var id = ++rpcId;
      pending[id] = { resolve: resolve, reject: reject };
      try { window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*'); }
      catch(e) { delete pending[id]; reject(e); }
    });
  }

  function rpcNotify(method, params) {
    try { window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*'); } catch(e) {}
  }

  function showLoading(text) {
    state.loading = true;
    var lt = loader.querySelector('.loading-text');
    if (lt) lt.textContent = text || 'Loading...';
    loader.classList.add('active');
  }

  function hideLoading() {
    state.loading = false;
    loader.classList.remove('active');
  }

  function callTool(name, args) {
    showLoading(name === 'search_experiences' ? 'Searching experiences...' : name === 'get_experience_details' ? 'Loading details...' : 'Loading more...');
    return rpcRequest('tools/call', { name: name, arguments: args }).then(function(result) {
      hideLoading();
      handleData(result && result.structuredContent);
    }).catch(function() { hideLoading(); });
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;

    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }

    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      hideLoading();
      handleData(msg.params.structuredContent || msg.params._meta);
    }
  });

  rpcRequest('ui/initialize', {
    appInfo: { name: 'Holibob Combined', version: '1.1.0' },
    appCapabilities: {},
    protocolVersion: '2026-01-26'
  }).then(function() {
    window._bridgeResolve();
    rpcNotify('ui/notifications/initialized', {});
  }).catch(function() {
    window._bridgeResolve();
  });

  // === Widget logic ===
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function handleData(data) {
    if (!data) return;
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);

    if (data.defaults || data.prefilled || data.suggestions) {
      var defaults = data.defaults || {};
      var prefilled = data.prefilled || {};
      var suggestions = data.suggestions || {};
      state.allChips.where = (suggestions.destinations && suggestions.destinations.length) ? suggestions.destinations.map(function(d){return d.name}) : (defaults.where || ['London','Paris','Barcelona','Rome','Amsterdam','Edinburgh']);
      state.allChips.when = defaults.when || ['Today','Tomorrow','This Weekend','Next Week','Next Month'];
      state.allChips.who = defaults.who || ['Solo Traveller','Couple','Family with Kids','Group of Friends'];
      state.allChips.what = (suggestions.tags && suggestions.tags.length) ? suggestions.tags.map(function(t){return t.name}) : (defaults.what || ['Walking Tours','Food & Drink','Museums','Outdoor Activities','Day Trips']);
      sKeys.forEach(function(k){ if (prefilled[k]) state.selections[k] = prefilled[k]; });
      state.activeIdx = 0;
      for (var i = 0; i < sKeys.length; i++) { if (!state.selections[sKeys[i]]){ state.activeIdx = i; break; } if (i===3) state.activeIdx = 4; }
    }

    if (data.experiences) {
      data.experiences.forEach(function(exp){ if (!state.seenIds[exp.id]){ state.seenIds[exp.id]=true; state.experiences.push(exp); }});
      state.destination = data.destination || state.destination;
      state.hasMore = data.hasMore || false;
      state.plannerExpanded = false;
      state.detail = null;
    }

    if (data.experience) {
      state.detail = data.experience;
      state.activeTab = 'desc';
    }

    render();
    if (data.experience) { setTimeout(function(){ var ds = document.getElementById('detailSection'); if (ds) ds.scrollIntoView({behavior:'smooth'}); }, 50); }
    else if (data.experiences) { setTimeout(function(){ var cs = document.getElementById('carouselSection'); if (cs) cs.scrollIntoView({behavior:'smooth'}); }, 50); }
  }

  function render() {
    var html = '';

    if (state.plannerExpanded) {
      html += renderPlanner();
    } else {
      var parts = [];
      sKeys.forEach(function(k){ if (state.selections[k]) parts.push(state.selections[k]); });
      html += '<div class="planner-collapsed" data-action="expand-planner"><span style="font-size:16px">\\u{1F4CD}</span><span class="summary">' + esc(parts.join(' \\u00B7 ')) + '</span><span class="edit-btn">Edit</span></div>';
    }

    if (state.experiences.length) html += '<div class="section-divider"></div>';
    html += '<div class="carousel-section' + (state.experiences.length ? ' visible' : '') + '" id="carouselSection">';
    html += renderCarousel();
    html += '</div>';

    if (state.detail) html += '<div class="section-divider"></div>';
    html += '<div class="detail-section' + (state.detail ? ' visible' : '') + '" id="detailSection">';
    if (state.detail) html += renderDetail();
    html += '</div>';

    root.innerHTML = html;
    updateCarouselScroll();
  }

  function renderPlanner() {
    var sel = state.selections;
    var filledCount = sKeys.filter(function(k){return !!sel[k]}).length;
    var canSearch = !!(sel.where || sel.what);
    var h = '<div class="planner">';
    h += '<div class="progress">';
    for (var d = 0; d < 4; d++) h += '<div class="dot' + (d < filledCount ? ' done' : (d === state.activeIdx ? ' active' : '')) + '"></div>';
    h += '</div>';
    for (var i = 0; i < 4; i++) {
      var key = sKeys[i], isActive = (i === state.activeIdx), val = sel[key];
      h += '<div class="section' + (isActive ? ' active' : '') + '">';
      h += '<div class="section-header" data-action="toggle" data-idx="' + i + '"><div class="section-icon">' + sIcons[i] + '</div><div><div class="section-label">' + sLabels[i] + '</div>';
      if (val) h += '<div class="section-value">' + esc(val) + '</div>';
      h += '</div><div class="section-chevron">\\u25BE</div></div>';
      h += '<div class="section-body"><div class="input-row"><input type="text" data-key="' + key + '" placeholder="' + sPlaceholders[i] + '" value="' + esc(val) + '"></div><div class="chips">';
      (state.allChips[key] || []).forEach(function(c){ h += '<div class="chip' + (val===c?' selected':'') + '" data-action="chip" data-key="' + key + '" data-val="' + esc(c) + '">' + esc(c) + '</div>'; });
      h += '</div></div></div>';
    }
    h += '<button class="cta" data-action="search"' + (canSearch ? '' : ' disabled') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Search Experiences</button></div>';
    return h;
  }

  function renderCarousel() {
    if (!state.experiences.length) return '';
    var h = '<div class="carousel-header"><h3>Experiences' + (state.destination ? ' in ' + esc(state.destination) : '') + '</h3><span class="count">' + state.experiences.length + ' found</span></div>';
    h += '<div class="carousel">';
    h += '<button class="nav-btn left' + (state.carouselIdx <= 0 ? ' hidden':'') + '" data-action="nav" data-dir="left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>';
    h += '<div class="viewport"><div class="track" id="ctrack">';
    state.experiences.forEach(function(exp){
      h += '<div class="card" data-action="card-click" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '"><div class="card-img">';
      if (exp.imageUrl) h += '<img src="' + esc(exp.imageUrl) + '" alt="" loading="lazy">';
      if (exp.isBestSeller) h += '<div class="badge">Best Seller</div>';
      if (exp.rating) h += '<div class="rating-badge"><span class="star">\\u2605</span>' + exp.rating + '</div>';
      h += '</div><div class="card-body"><div class="card-title">' + esc(exp.name) + '</div>';
      if (exp.location) h += '<div class="card-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(exp.location) + '</div>';
      h += '<div class="card-meta">';
      if (exp.duration) h += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + esc(exp.duration) + '</span>';
      if (exp.reviewCount) h += '<span>' + exp.reviewCount + ' reviews</span>';
      h += '</div></div><div class="card-footer">';
      if (exp.price) h += '<div class="price"><span class="price-label">From </span>' + esc(exp.price) + '</div>';
      h += '<button class="view-btn" data-action="view-detail" data-id="' + esc(exp.id) + '">Details</button></div></div>';
    });
    if (state.hasMore) h += '<div class="load-more" data-action="load-more"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg><span>Show more</span></div>';
    h += '</div></div>';
    h += '<button class="nav-btn right" data-action="nav" data-dir="right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>';
    h += '</div>';
    return h;
  }

  function renderDetail() {
    var exp = state.detail;
    if (!exp) return '';
    var h = '<div class="back-link" data-action="back-to-results"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>Back to results</div>';
    h += '<div class="detail-hero">';
    if (exp.imageUrl) h += '<img src="' + esc(exp.imageUrl) + '" alt="">';
    h += '<div class="overlay"><h2>' + esc(exp.name) + '</h2></div></div>';
    h += '<div class="detail-meta">';
    if (exp.location) h += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(exp.location) + '</span>';
    if (exp.rating) h += '<span><span style="color:var(--yellow)">\\u2605</span> ' + exp.rating + (exp.reviewCount ? ' (' + exp.reviewCount + ')' : '') + '</span>';
    if (exp.duration) h += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + esc(exp.duration) + '</span>';
    if (exp.price) h += '<span style="font-weight:700;color:var(--primary)">' + esc(exp.price) + '</span>';
    h += '</div>';

    var tabs = [['desc','Description']];
    if (exp.highlights && exp.highlights.length) tabs.push(['high','Highlights']);
    if ((exp.inclusions && exp.inclusions.length) || (exp.exclusions && exp.exclusions.length)) tabs.push(['incl',"What's Included"]);
    if (exp.reviews && exp.reviews.length) tabs.push(['rev','Reviews']);
    h += '<div class="detail-tabs">';
    tabs.forEach(function(t){ h += '<div class="tab' + (state.activeTab === t[0] ? ' active' : '') + '" data-action="tab" data-tab="' + t[0] + '">' + t[1] + '</div>'; });
    h += '</div>';

    h += '<div class="tab-content' + (state.activeTab === 'desc' ? ' active' : '') + '">' + esc(exp.description || 'No description available.') + '</div>';
    if (exp.highlights && exp.highlights.length) {
      h += '<div class="tab-content' + (state.activeTab === 'high' ? ' active' : '') + '">';
      exp.highlights.forEach(function(hl){ h += '<div class="list-item"><span class="icon-g">\\u2713</span> ' + esc(hl) + '</div>'; });
      h += '</div>';
    }
    h += '<div class="tab-content' + (state.activeTab === 'incl' ? ' active' : '') + '">';
    if (exp.inclusions) exp.inclusions.forEach(function(item){ h += '<div class="list-item"><span class="icon-g">\\u2713</span> ' + esc(item) + '</div>'; });
    if (exp.exclusions) exp.exclusions.forEach(function(item){ h += '<div class="list-item"><span class="icon-r">\\u2717</span> ' + esc(item) + '</div>'; });
    h += '</div>';
    if (exp.reviews && exp.reviews.length) {
      h += '<div class="tab-content' + (state.activeTab === 'rev' ? ' active' : '') + '">';
      exp.reviews.forEach(function(r){
        h += '<div class="review"><div class="review-author">' + esc(r.author || 'Anonymous') + '</div>';
        if (r.rating) { h += '<div class="review-stars">'; for (var s = 0; s < 5; s++) h += (s < r.rating ? '\\u2605' : '\\u2606'); h += '</div>'; }
        h += '<div class="review-text">' + esc(r.text || '') + '</div></div>';
      });
      h += '</div>';
    }

    if (exp.cancellationPolicy) h += '<div class="cancel-policy">\\u2713 ' + esc(exp.cancellationPolicy) + '</div>';
    var suggestText = 'Book "' + (exp.name || '') + '"';
    h += '<div class="chat-handoff">';
    h += '<div class="handoff-icon">\\u{1F4AC}</div>';
    h += '<div class="handoff-title">Ready to book?</div>';
    h += '<div class="handoff-desc">Type in the chat below to check availability and complete your booking.</div>';
    h += '<div class="handoff-suggestion" data-action="copy-suggestion" data-text="' + esc(suggestText) + '">';
    h += '<span class="suggestion-text">\\u201C' + esc(suggestText) + '\\u201D</span>';
    h += '<span class="copy-icon">\\u{1F4CB}</span>';
    h += '</div></div>';
    return h;
  }

  function updateCarouselScroll() {
    var track = document.getElementById('ctrack');
    if (!track) return;
    var cw = 260 + 14;
    track.style.transform = 'translateX(-' + (state.carouselIdx * cw) + 'px)';
    var vp = track.parentElement;
    var vis = Math.floor((vp.offsetWidth || 400) / cw);
    var maxIdx = Math.max(0, state.experiences.length + (state.hasMore ? 1 : 0) - vis);
    var left = root.querySelector('.nav-btn.left');
    var right = root.querySelector('.nav-btn.right');
    if (left) left.classList.toggle('hidden', state.carouselIdx <= 0);
    if (right) right.classList.toggle('hidden', state.carouselIdx >= maxIdx);
  }

  function advanceToNextEmpty() {
    for (var n = 0; n < sKeys.length; n++) { if (!state.selections[sKeys[n]]){ state.activeIdx = n; return; } }
    state.activeIdx = 4;
  }

  // === EVENT DELEGATION (single handler, no rebinding needed) ===
  root.addEventListener('click', function(e) {
    if (state.loading) return;
    var target = e.target;

    // Find the closest element with a data-action
    var actionEl = target.closest ? target.closest('[data-action]') : null;
    if (!actionEl) return;

    var action = actionEl.getAttribute('data-action');

    switch (action) {
      case 'expand-planner':
        state.plannerExpanded = true;
        render();
        break;

      case 'toggle':
        state.activeIdx = parseInt(actionEl.getAttribute('data-idx'), 10);
        render();
        break;

      case 'chip':
        var chipKey = actionEl.getAttribute('data-key');
        var chipVal = actionEl.getAttribute('data-val');
        state.selections[chipKey] = chipVal;
        advanceToNextEmpty();
        render();
        break;

      case 'search':
        if (actionEl.disabled) return;
        // Clear previous results when re-searching
        state.experiences = [];
        state.seenIds = {};
        state.carouselIdx = 0;
        state.detail = null;
        state.hasMore = false;
        var s = state.selections;
        var args = { destination: s.where || 'popular destinations' };
        if (s.what) args.searchTerm = s.what;
        bridgeReady.then(function() { callTool('search_experiences', args); });
        break;

      case 'nav':
        var dir = actionEl.getAttribute('data-dir');
        if (dir === 'left') state.carouselIdx = Math.max(0, state.carouselIdx - 1);
        else state.carouselIdx++;
        updateCarouselScroll();
        break;

      case 'view-detail':
        e.stopPropagation();
        var detailId = actionEl.getAttribute('data-id');
        bridgeReady.then(function() { callTool('get_experience_details', { experienceId: detailId }); });
        break;

      case 'card-click':
        var cardId = actionEl.getAttribute('data-id');
        bridgeReady.then(function() { callTool('get_experience_details', { experienceId: cardId }); });
        break;

      case 'load-more':
        var ids = state.experiences.map(function(ex) { return ex.id; });
        bridgeReady.then(function() { callTool('load_more_experiences', { destination: state.destination, seenExperienceIds: ids }); });
        break;

      case 'back-to-results':
        state.detail = null;
        render();
        setTimeout(function(){ var cs = document.getElementById('carouselSection'); if (cs) cs.scrollIntoView({behavior:'smooth'}); }, 50);
        break;

      case 'tab':
        state.activeTab = actionEl.getAttribute('data-tab');
        render();
        break;

      case 'copy-suggestion':
        var copyText = actionEl.getAttribute('data-text');
        if (copyText) {
          var copied = false;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(copyText).then(function(){ copied = true; }).catch(function(){});
              copied = true;
            }
          } catch(e) {}
          if (!copied) {
            try {
              var ta = document.createElement('textarea');
              ta.value = copyText;
              ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            } catch(e) {}
          }
          var copyIcon = actionEl.querySelector('.copy-icon');
          if (copyIcon) { copyIcon.textContent = '\\u2713'; setTimeout(function(){ copyIcon.textContent = '\\u{1F4CB}'; }, 1500); }
        }
        break;
    }
  });

  // Keyboard handler for inputs (delegated)
  root.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    var inp = e.target;
    if (!inp || !inp.getAttribute || !inp.getAttribute('data-key')) return;
    var val = inp.value.trim();
    if (!val) return;
    state.selections[inp.getAttribute('data-key')] = val;
    advanceToNextEmpty();
    render();
  });

  // Initial render
  render();
})();
</script>
</body>
</html>`;
