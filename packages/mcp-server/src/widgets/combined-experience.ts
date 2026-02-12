export const COMBINED_EXPERIENCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Holibob Experiences</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-400: #9CA3AF; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --yellow: #FACC15; --green: #059669; --red: #DC2626; --shadow: 0 4px 12px rgba(0,0,0,0.08); --card-w: 260px; --gap: 16px; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: white; -webkit-font-smoothing: antialiased; }

  /* === PLANNER === */
  .planner { padding: 16px; }
  .planner-collapsed { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 10px; cursor: pointer; margin: 16px 16px 0; transition: background 0.15s; }
  .planner-collapsed:hover { background: var(--gray-100); }
  .planner-collapsed .summary { font-size: 14px; font-weight: 600; color: var(--gray-600); flex: 1; }
  .planner-collapsed .edit-btn { font-size: 12px; font-weight: 700; color: var(--primary); }
  .progress { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 16px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gray-200); transition: all 0.2s; }
  .dot.active { background: var(--primary); width: 24px; border-radius: 4px; }
  .dot.done { background: var(--primary); }
  .section { border: 1px solid var(--gray-200); border-radius: 12px; margin-bottom: 8px; overflow: hidden; transition: all 0.2s; background: white; }
  .section.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.12); }
  .section-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; }
  .section-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; background: var(--gray-100); flex-shrink: 0; }
  .section.active .section-icon { background: var(--primary-light); }
  .section-label { font-size: 12px; font-weight: 700; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; }
  .section-value { font-size: 13px; font-weight: 600; color: var(--gray-900); margin-top: 1px; }
  .section-chevron { margin-left: auto; color: var(--gray-400); font-size: 16px; transition: transform 0.2s; }
  .section.active .section-chevron { transform: rotate(180deg); }
  .section-body { display: none; padding: 0 14px 12px; }
  .section.active .section-body { display: block; }
  .input-row { margin-bottom: 8px; }
  .input-row input { width: 100%; padding: 9px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 13px; color: var(--gray-900); background: white; outline: none; transition: border-color 0.15s; }
  .input-row input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.15); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: var(--gray-100); color: var(--gray-600); border: 1px solid transparent; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .chip:hover { background: var(--gray-200); }
  .chip.selected { background: var(--primary); color: white; }
  .cta { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 12px; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .cta:hover { opacity: 0.9; }
  .cta:disabled { opacity: 0.4; cursor: not-allowed; }
  .cta svg { width: 16px; height: 16px; }

  /* === CAROUSEL === */
  .carousel-section { display: none; padding: 16px; border-top: 1px solid var(--gray-200); }
  .carousel-section.visible { display: block; }
  .carousel-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
  .carousel-header h3 { font-size: 16px; font-weight: 700; }
  .carousel-header .count { font-size: 12px; color: var(--gray-500); }
  .carousel { position: relative; }
  .viewport { overflow: hidden; }
  .track { display: flex; gap: var(--gap); transition: transform 0.3s ease-out; }
  .card { width: var(--card-w); flex-shrink: 0; border: 1px solid var(--gray-200); border-radius: 12px; background: white; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s, transform 0.2s; }
  .card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
  .card-img { position: relative; width: 100%; aspect-ratio: 4/3; background: var(--gray-100); overflow: hidden; }
  .card-img img { width: 100%; height: 100%; object-fit: cover; }
  .badge { position: absolute; top: 8px; left: 8px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: var(--primary); color: white; }
  .rating-badge { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 3px; padding: 3px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.6); color: white; }
  .star { color: var(--yellow); }
  .card-body { padding: 10px; }
  .card-title { font-size: 13px; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px; min-height: 34px; }
  .card-loc { font-size: 11px; color: var(--gray-500); display: flex; align-items: center; gap: 3px; margin-bottom: 3px; }
  .card-loc svg { width: 11px; height: 11px; flex-shrink: 0; }
  .card-meta { font-size: 11px; color: var(--gray-500); display: flex; gap: 10px; margin-bottom: 6px; }
  .card-meta svg { width: 11px; height: 11px; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; padding: 0 10px 10px; }
  .price { font-size: 14px; font-weight: 700; color: var(--primary); }
  .price-label { font-size: 10px; color: var(--gray-500); font-weight: 400; }
  .view-btn { padding: 5px 10px; border-radius: 8px; border: 1px solid var(--primary); background: transparent; color: var(--primary); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .view-btn:hover { background: var(--primary); color: white; }
  .nav-btn { position: absolute; top: 50%; transform: translateY(-80%); width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--gray-200); background: white; box-shadow: 0 2px 6px rgba(0,0,0,0.08); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; }
  .nav-btn:hover { background: var(--gray-50); }
  .nav-btn.left { left: -10px; }
  .nav-btn.right { right: -10px; }
  .nav-btn.hidden { display: none; }
  .nav-btn svg { width: 14px; height: 14px; color: var(--gray-600); }
  .load-more { width: var(--card-w); flex-shrink: 0; border: 2px dashed var(--gray-200); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; min-height: 240px; transition: all 0.15s; }
  .load-more:hover { border-color: var(--primary); background: var(--primary-light); }
  .load-more svg { width: 28px; height: 28px; color: var(--gray-400); }
  .load-more:hover svg { color: var(--primary); }
  .load-more span { font-size: 12px; font-weight: 600; color: var(--gray-500); }

  /* === DETAIL === */
  .detail-section { display: none; padding: 16px; border-top: 1px solid var(--gray-200); }
  .detail-section.visible { display: block; }
  .back-link { font-size: 13px; color: var(--primary); font-weight: 600; cursor: pointer; margin-bottom: 12px; display: inline-flex; align-items: center; gap: 4px; }
  .back-link:hover { text-decoration: underline; }
  .back-link svg { width: 14px; height: 14px; }
  .detail-hero { width: 100%; height: 180px; border-radius: 12px; overflow: hidden; position: relative; background: var(--gray-100); margin-bottom: 14px; }
  .detail-hero img { width: 100%; height: 100%; object-fit: cover; }
  .detail-hero .overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 14px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: white; }
  .detail-hero .overlay h2 { font-size: 18px; font-weight: 700; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; font-size: 13px; color: var(--gray-600); }
  .detail-meta span { display: flex; align-items: center; gap: 4px; }
  .detail-meta svg { width: 14px; height: 14px; }
  .detail-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--gray-200); margin-bottom: 14px; }
  .tab { padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--gray-500); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
  .tab-content { display: none; font-size: 13px; line-height: 1.6; color: var(--gray-600); margin-bottom: 14px; min-height: 60px; }
  .tab-content.active { display: block; }
  .list-item { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; }
  .list-item .icon-g { color: var(--green); flex-shrink: 0; }
  .list-item .icon-r { color: var(--red); flex-shrink: 0; }
  .review { padding: 10px; border: 1px solid var(--gray-100); border-radius: 8px; margin-bottom: 8px; }
  .review-author { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
  .review-stars { color: var(--yellow); font-size: 12px; margin-bottom: 4px; }
  .review-text { font-size: 12px; color: var(--gray-600); }
  .detail-cta { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; }
  .detail-cta:hover { opacity: 0.9; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function() {
  var root = document.getElementById('root');
  var state = {
    plannerExpanded: true,
    selections: { where: '', when: '', who: '', what: '' },
    activeIdx: 0,
    allChips: {},
    experiences: [],
    seenIds: {},
    destination: '',
    hasMore: false,
    carouselIdx: 0,
    detail: null,
    activeTab: 'desc'
  };
  var sKeys = ['where','when','who','what'];
  var sLabels = ['Where','When','Who','What'];
  var sIcons = ['\\u{1F4CD}','\\u{1F4C5}','\\u{1F465}','\\u{2728}'];
  var sPlaceholders = ['Type a destination...','When are you going?','Who is travelling?','What do you want to do?'];

  // Global error handlers to prevent widget teardown
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

  function sendMessage(text) {
    rpcNotify('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
  }

  function callTool(name, args) {
    return rpcRequest('tools/call', { name: name, arguments: args }).then(function(result) {
      handleData(result && result.structuredContent);
    }).catch(function() {});
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
      handleData(msg.params.structuredContent || msg.params._meta);
    }
  });

  rpcRequest('ui/initialize', {
    appInfo: { name: 'Holibob Combined', version: '1.0.0' },
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
    if (data.experience) { var ds = document.getElementById('detailSection'); if (ds) ds.scrollIntoView({behavior:'smooth'}); }
    else if (data.experiences) { var cs = document.getElementById('carouselSection'); if (cs) cs.scrollIntoView({behavior:'smooth'}); }
  }

  function render() {
    var html = '';

    if (state.plannerExpanded) {
      html += renderPlanner();
    } else {
      var parts = [];
      sKeys.forEach(function(k){ if (state.selections[k]) parts.push(state.selections[k]); });
      html += '<div class="planner-collapsed" id="plannerToggle"><span style="font-size:16px">\\u{1F4CD}</span><span class="summary">' + esc(parts.join(' \\u00B7 ')) + '</span><span class="edit-btn">Edit</span></div>';
    }

    html += '<div class="carousel-section' + (state.experiences.length ? ' visible' : '') + '" id="carouselSection">';
    html += renderCarousel();
    html += '</div>';

    html += '<div class="detail-section' + (state.detail ? ' visible' : '') + '" id="detailSection">';
    if (state.detail) html += renderDetail();
    html += '</div>';

    root.innerHTML = html;
    bindAll();
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
      h += '<div class="section' + (isActive ? ' active' : '') + '" data-idx="' + i + '">';
      h += '<div class="section-header" data-toggle="' + i + '"><div class="section-icon">' + sIcons[i] + '</div><div><div class="section-label">' + sLabels[i] + '</div>';
      if (val) h += '<div class="section-value">' + esc(val) + '</div>';
      h += '</div><div class="section-chevron">\\u25BE</div></div>';
      h += '<div class="section-body"><div class="input-row"><input type="text" data-key="' + key + '" placeholder="' + sPlaceholders[i] + '" value="' + esc(val) + '"></div><div class="chips">';
      (state.allChips[key] || []).forEach(function(c){ h += '<div class="chip' + (val===c?' selected':'') + '" data-key="' + key + '" data-val="' + esc(c) + '">' + esc(c) + '</div>'; });
      h += '</div></div></div>';
    }
    h += '<button class="cta"' + (canSearch ? '' : ' disabled') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Search Experiences</button></div>';
    return h;
  }

  function renderCarousel() {
    if (!state.experiences.length) return '';
    var h = '<div class="carousel-header"><h3>Experiences' + (state.destination ? ' in ' + esc(state.destination) : '') + '</h3><span class="count">' + state.experiences.length + ' found</span></div>';
    h += '<div class="carousel">';
    h += '<button class="nav-btn left' + (state.carouselIdx <= 0 ? ' hidden':'') + '" data-dir="left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>';
    h += '<div class="viewport"><div class="track" id="ctrack">';
    state.experiences.forEach(function(exp){
      h += '<div class="card" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '"><div class="card-img">';
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
      h += '<button class="view-btn" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '">Details</button></div></div>';
    });
    if (state.hasMore) h += '<div class="load-more" id="loadMore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg><span>Show more</span></div>';
    h += '</div></div>';
    h += '<button class="nav-btn right" data-dir="right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>';
    h += '</div>';
    return h;
  }

  function renderDetail() {
    var exp = state.detail;
    if (!exp) return '';
    var h = '<div class="back-link" id="backToResults"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>Back to results</div>';
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
    tabs.forEach(function(t){ h += '<div class="tab' + (state.activeTab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</div>'; });
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

    if (exp.cancellationPolicy) h += '<div style="font-size:12px;color:var(--green);margin-bottom:12px">\\u2713 ' + esc(exp.cancellationPolicy) + '</div>';
    h += '<button class="detail-cta" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '">Check Availability</button>';
    return h;
  }

  function updateCarouselScroll() {
    var track = document.getElementById('ctrack');
    if (!track) return;
    var cw = 260 + 16;
    track.style.transform = 'translateX(-' + (state.carouselIdx * cw) + 'px)';
    var vp = track.parentElement;
    var vis = Math.floor((vp.offsetWidth || 400) / cw);
    var maxIdx = Math.max(0, state.experiences.length + (state.hasMore ? 1 : 0) - vis);
    var left = root.querySelector('.nav-btn.left');
    var right = root.querySelector('.nav-btn.right');
    if (left) left.classList.toggle('hidden', state.carouselIdx <= 0);
    if (right) right.classList.toggle('hidden', state.carouselIdx >= maxIdx);
  }

  function bindAll() {
    var pt = document.getElementById('plannerToggle');
    if (pt) pt.addEventListener('click', function(){ state.plannerExpanded = true; render(); });

    root.querySelectorAll('[data-toggle]').forEach(function(el){
      el.addEventListener('click', function(){ state.activeIdx = parseInt(el.getAttribute('data-toggle'), 10); render(); });
    });

    root.querySelectorAll('.chip').forEach(function(chip){
      chip.addEventListener('click', function(){
        var key = chip.getAttribute('data-key'), val = chip.getAttribute('data-val');
        state.selections[key] = val;
        for (var n = 0; n < sKeys.length; n++) { if (!state.selections[sKeys[n]]){ state.activeIdx = n; render(); return; } }
        state.activeIdx = 4; render();
      });
    });

    root.querySelectorAll('input[data-key]').forEach(function(inp){
      inp.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && inp.value.trim()) {
          state.selections[inp.getAttribute('data-key')] = inp.value.trim();
          for (var n = 0; n < sKeys.length; n++) { if (!state.selections[sKeys[n]]){ state.activeIdx = n; render(); return; } }
          state.activeIdx = 4; render();
        }
      });
    });

    // Search CTA — calls search_experiences directly via tools/call
    var cta = root.querySelector('.cta');
    if (cta) cta.addEventListener('click', function(){
      if (cta.disabled) return;
      var s = state.selections;
      var args = { destination: s.where || 'popular destinations' };
      if (s.what) args.searchTerm = s.what;
      bridgeReady.then(function() { callTool('search_experiences', args); });
    });

    // Carousel nav
    root.querySelectorAll('.nav-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (btn.getAttribute('data-dir') === 'left') state.carouselIdx = Math.max(0, state.carouselIdx - 1);
        else state.carouselIdx++;
        updateCarouselScroll();
      });
    });

    // Card clicks — calls get_experience_details directly via tools/call
    root.querySelectorAll('.card, .view-btn').forEach(function(el){
      el.addEventListener('click', function(e){
        var t = e.target.closest('[data-id]');
        if (!t) return;
        e.stopPropagation();
        var id = t.getAttribute('data-id');
        bridgeReady.then(function() { callTool('get_experience_details', { experienceId: id }); });
      });
    });

    // Load more — calls load_more_experiences directly via tools/call
    var lm = document.getElementById('loadMore');
    if (lm) lm.addEventListener('click', function(){
      var ids = state.experiences.map(function(e) { return e.id; });
      bridgeReady.then(function() { callTool('load_more_experiences', { destination: state.destination, seenExperienceIds: ids }); });
    });

    // Back to results
    var back = document.getElementById('backToResults');
    if (back) back.addEventListener('click', function(){ state.detail = null; render(); var cs = document.getElementById('carouselSection'); if (cs) cs.scrollIntoView({behavior:'smooth'}); });

    // Tabs
    root.querySelectorAll('.tab').forEach(function(tab){
      tab.addEventListener('click', function(){ state.activeTab = tab.getAttribute('data-tab'); render(); });
    });

    // Detail CTA — sends message for chat to handle booking
    var dcta = root.querySelector('.detail-cta');
    if (dcta) dcta.addEventListener('click', function(){
      var id = dcta.getAttribute('data-id'), name = dcta.getAttribute('data-name');
      bridgeReady.then(function() { sendMessage('Check availability for "' + name + '" (ID: ' + id + ')'); });
    });

    updateCarouselScroll();
  }

  // Initial empty render
  render();
})();
</script>
</body>
</html>`;
