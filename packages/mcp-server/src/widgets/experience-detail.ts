export const EXPERIENCE_DETAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Experience Details</title>
<style>
  :root { --primary: #0F766E; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --yellow: #FACC15; --green: #059669; --red: #DC2626; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .hero { position: relative; width: 100%; height: 200px; overflow: hidden; background: var(--gray-100); }
  .hero img { width: 100%; height: 100%; object-fit: cover; }
  .hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%); }
  .hero-text { position: absolute; bottom: 16px; left: 16px; right: 16px; color: white; }
  .hero-text h1 { font-size: 20px; font-weight: 700; line-height: 1.2; margin-bottom: 6px; }
  .hero-meta { display: flex; align-items: center; gap: 12px; font-size: 13px; opacity: 0.9; }
  .hero-meta svg { width: 14px; height: 14px; }
  .star { color: var(--yellow); }
  .content { padding: 16px; }
  .tabs { display: flex; gap: 2px; border-bottom: 2px solid var(--gray-200); margin-bottom: 16px; overflow-x: auto; }
  .tab { padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--gray-500); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; transition: color 0.15s, border-color 0.15s; }
  .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
  .tab:hover { color: var(--gray-900); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .description { font-size: 14px; line-height: 1.6; color: var(--gray-600); }
  .list-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; font-size: 14px; color: var(--gray-600); }
  .list-item svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
  .list-item.inclusion svg { color: var(--green); }
  .list-item.exclusion svg { color: var(--red); }
  .list-item.highlight svg { color: var(--primary); }
  .review { padding: 12px 0; border-bottom: 1px solid var(--gray-100); }
  .review:last-child { border-bottom: none; }
  .review-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .review-author { font-size: 13px; font-weight: 600; }
  .review-stars { display: flex; gap: 1px; }
  .review-stars svg { width: 12px; height: 12px; }
  .review-text { font-size: 13px; color: var(--gray-600); line-height: 1.5; }
  .info-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 14px; color: var(--gray-600); border-bottom: 1px solid var(--gray-100); }
  .info-row:last-child { border-bottom: none; }
  .info-row svg { width: 16px; height: 16px; color: var(--gray-500); flex-shrink: 0; }
  .info-label { font-weight: 600; color: var(--gray-900); min-width: 100px; }
  .cancel-badge { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; background: #ECFDF5; color: var(--green); font-size: 13px; font-weight: 600; margin-top: 12px; }
  .cancel-badge svg { width: 16px; height: 16px; }
  .cta { display: block; width: 100%; padding: 14px; margin-top: 16px; border: none; border-radius: 12px; background: var(--primary); color: white; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; transition: opacity 0.15s; }
  .cta:hover { opacity: 0.9; }
  .images-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; }
  .images-row img { width: 140px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
  .empty { text-align: center; padding: 48px 16px; color: var(--gray-500); }
</style>
</head>
<body>
<div id="root"><div class="empty">Loading experience details...</div></div>
<script>
(function() {
  // Global error handlers to prevent widget teardown
  window.onerror = function() { return true; };
  window.addEventListener('unhandledrejection', function(e) { e.preventDefault(); });

  var root = document.getElementById('root');

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

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function starSvg(filled) {
    return '<svg viewBox="0 0 20 20" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';
  }
  function checkSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>'; }
  function xSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'; }
  function sparkle() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>'; }

  function render(data) {
    if (!data || !data.experience) { root.innerHTML = '<div class="empty">Experience not found.</div>'; return; }
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);
    var exp = data.experience;
    var html = '';

    // Hero
    html += '<div class="hero">';
    if (exp.imageUrl) html += '<img src="' + esc(exp.imageUrl) + '" alt="' + esc(exp.name) + '">';
    html += '<div class="hero-overlay"></div>';
    html += '<div class="hero-text"><h1>' + esc(exp.name) + '</h1>';
    html += '<div class="hero-meta">';
    if (exp.location) html += '<span>' + esc(exp.location) + '</span>';
    if (exp.rating) html += '<span class="star">' + starSvg(true) + '</span><span>' + exp.rating.toFixed(1) + (exp.reviewCount ? ' (' + exp.reviewCount + ')' : '') + '</span>';
    if (exp.price) html += '<span>' + esc(exp.price) + '</span>';
    html += '</div></div></div>';

    // Images row
    if (exp.images && exp.images.length > 1) {
      html += '<div class="images-row" style="padding:8px 16px 0">';
      exp.images.slice(0, 6).forEach(function(img) { html += '<img src="' + esc(img.url) + '" alt="' + esc(img.alt || exp.name) + '">'; });
      html += '</div>';
    }

    html += '<div class="content">';

    // Tabs
    var tabs = [{ id: 'desc', label: 'Description' }];
    if (exp.highlights && exp.highlights.length) tabs.push({ id: 'highlights', label: 'Highlights' });
    if ((exp.inclusions && exp.inclusions.length) || (exp.exclusions && exp.exclusions.length)) tabs.push({ id: 'included', label: "What\\'s Included" });
    if (exp.reviews && exp.reviews.length) tabs.push({ id: 'reviews', label: 'Reviews' });

    html += '<div class="tabs">';
    tabs.forEach(function(t, i) { html += '<button class="tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'; });
    html += '</div>';

    // Description panel
    html += '<div class="tab-panel active" id="panel-desc">';
    html += '<div class="description">' + (exp.description || 'No description available.') + '</div>';
    if (exp.duration) html += '<div class="info-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span class="info-label">Duration</span><span>' + esc(exp.duration) + '</span></div>';
    if (exp.languages) html += '<div class="info-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"/></svg><span class="info-label">Languages</span><span>' + esc(exp.languages) + '</span></div>';
    if (exp.cancellationPolicy) html += '<div class="cancel-badge">' + checkSvg() + esc(exp.cancellationPolicy) + '</div>';
    html += '</div>';

    // Highlights panel
    if (exp.highlights && exp.highlights.length) {
      html += '<div class="tab-panel" id="panel-highlights">';
      exp.highlights.forEach(function(h) { html += '<div class="list-item highlight">' + sparkle() + '<span>' + esc(h) + '</span></div>'; });
      html += '</div>';
    }

    // Included panel
    if ((exp.inclusions && exp.inclusions.length) || (exp.exclusions && exp.exclusions.length)) {
      html += '<div class="tab-panel" id="panel-included">';
      if (exp.inclusions) exp.inclusions.forEach(function(i) { html += '<div class="list-item inclusion">' + checkSvg() + '<span>' + esc(i) + '</span></div>'; });
      if (exp.exclusions) { html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100)"></div>'; exp.exclusions.forEach(function(e) { html += '<div class="list-item exclusion">' + xSvg() + '<span>' + esc(e) + '</span></div>'; }); }
      html += '</div>';
    }

    // Reviews panel
    if (exp.reviews && exp.reviews.length) {
      html += '<div class="tab-panel" id="panel-reviews">';
      exp.reviews.forEach(function(r) {
        html += '<div class="review"><div class="review-header"><span class="review-author">' + esc(r.author || 'Anonymous') + '</span>';
        html += '<div class="review-stars">';
        for (var s = 0; s < 5; s++) html += '<span class="star">' + starSvg(s < Math.round(r.rating || 0)) + '</span>';
        html += '</div></div>';
        if (r.text) html += '<div class="review-text">' + esc(r.text) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // CTA
    html += '<button class="cta" id="check-avail">Check Availability</button>';
    html += '</div>';
    root.innerHTML = html;

    // Tab switching
    root.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        root.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        root.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var panel = document.getElementById('panel-' + tab.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });

    // CTA
    var ctaBtn = document.getElementById('check-avail');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function() {
        bridgeReady.then(function() { sendMessage('Check availability for "' + exp.name + '" (ID: ' + exp.id + ')'); });
      });
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;

    // Handle responses to our requests
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }

    if (msg.method === 'ui/notifications/tool-result' && msg.params) render(msg.params.structuredContent || msg.params._meta);
  });

  // Initialize bridge
  rpcRequest('ui/initialize', {
    appInfo: { name: 'Holibob Detail', version: '1.0.0' },
    appCapabilities: {},
    protocolVersion: '2026-01-26'
  }).then(function() {
    window._bridgeResolve();
    rpcNotify('ui/notifications/initialized', {});
  }).catch(function() {
    window._bridgeResolve();
  });
})();
</script>
</body>
</html>`;
