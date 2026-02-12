export const TRIP_PLANNER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plan Your Trip</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-400: #9CA3AF; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --shadow: 0 4px 12px rgba(0,0,0,0.08); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  .progress { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 20px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gray-200); transition: all 0.2s; }
  .dot.active { background: var(--primary); width: 24px; border-radius: 4px; }
  .dot.done { background: var(--primary); }
  .section { border: 1px solid var(--gray-200); border-radius: 12px; margin-bottom: 10px; overflow: hidden; transition: all 0.2s; }
  .section.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.12); }
  .section-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; user-select: none; }
  .section-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; background: var(--gray-100); flex-shrink: 0; }
  .section.active .section-icon { background: var(--primary-light); }
  .section-label { font-size: 13px; font-weight: 700; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; }
  .section-value { font-size: 14px; font-weight: 600; color: var(--gray-900); margin-top: 1px; }
  .section-chevron { margin-left: auto; color: var(--gray-400); font-size: 18px; transition: transform 0.2s; }
  .section.active .section-chevron { transform: rotate(180deg); }
  .section-body { display: none; padding: 0 16px 14px; }
  .section.active .section-body { display: block; }
  .input-row { margin-bottom: 10px; }
  .input-row input { width: 100%; padding: 10px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 14px; color: var(--gray-900); outline: none; transition: border-color 0.15s; }
  .input-row input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.15); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 7px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background: var(--gray-100); color: var(--gray-600); border: 1px solid transparent; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .chip:hover { background: var(--gray-200); }
  .chip.selected { background: var(--primary); color: white; border-color: var(--primary); }
  .cta { width: 100%; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 16px; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .cta:hover { opacity: 0.9; }
  .cta:disabled { opacity: 0.4; cursor: not-allowed; }
  .cta svg { width: 18px; height: 18px; }
</style>
</head>
<body>
<div class="container" id="root"><div style="text-align:center;padding:40px;color:var(--gray-500)">Loading trip planner...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  var selections = { where: '', when: '', who: '', what: '' };
  var activeIdx = 0;
  var sectionKeys = ['where', 'when', 'who', 'what'];
  var sectionLabels = ['Where', 'When', 'Who', 'What'];
  var sectionIcons = ['\\u{1F4CD}', '\\u{1F4C5}', '\\u{1F465}', '\\u{2728}'];
  var sectionPlaceholders = ['Type a destination...', 'When are you going?', 'Who is travelling?', 'What do you want to do?'];
  var allChips = {};

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render(data) {
    if (!data) return;
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);

    var defaults = data.defaults || {};
    var prefilled = data.prefilled || {};
    var suggestions = data.suggestions || {};

    // Merge suggestions into defaults
    allChips.where = (suggestions.destinations && suggestions.destinations.length)
      ? suggestions.destinations.map(function(d) { return d.name; })
      : (defaults.where || ['London','Paris','Barcelona','Rome','Amsterdam','Edinburgh']);
    allChips.when = defaults.when || ['Today','Tomorrow','This Weekend','Next Week','Next Month'];
    allChips.who = defaults.who || ['Solo Traveller','Couple','Family with Kids','Group of Friends'];
    allChips.what = (suggestions.tags && suggestions.tags.length)
      ? suggestions.tags.map(function(t) { return t.name; })
      : (defaults.what || ['Walking Tours','Food & Drink','Museums','Outdoor Activities','Day Trips']);

    // Apply prefilled values
    sectionKeys.forEach(function(key) {
      if (prefilled[key]) selections[key] = prefilled[key];
    });

    // Find first unfilled section
    activeIdx = 0;
    for (var i = 0; i < sectionKeys.length; i++) {
      if (!selections[sectionKeys[i]]) { activeIdx = i; break; }
      if (i === sectionKeys.length - 1) activeIdx = sectionKeys.length; // all filled
    }

    renderUI();
  }

  function renderUI() {
    var filledCount = sectionKeys.filter(function(k) { return !!selections[k]; }).length;
    var canSearch = !!(selections.where || selections.what);

    var html = '<div class="container">';

    // Progress dots
    html += '<div class="progress">';
    for (var d = 0; d < 4; d++) {
      var cls = d < filledCount ? 'dot done' : (d === activeIdx ? 'dot active' : 'dot');
      html += '<div class="' + cls + '"></div>';
    }
    html += '</div>';

    // Sections
    for (var i = 0; i < sectionKeys.length; i++) {
      var key = sectionKeys[i];
      var isActive = (i === activeIdx);
      var val = selections[key];
      html += '<div class="section' + (isActive ? ' active' : '') + '" data-idx="' + i + '">';
      html += '<div class="section-header" data-toggle="' + i + '">';
      html += '<div class="section-icon">' + sectionIcons[i] + '</div>';
      html += '<div>';
      html += '<div class="section-label">' + sectionLabels[i] + '</div>';
      if (val) html += '<div class="section-value">' + esc(val) + '</div>';
      html += '</div>';
      html += '<div class="section-chevron">\\u25BE</div>';
      html += '</div>';
      html += '<div class="section-body">';
      html += '<div class="input-row"><input type="text" data-key="' + key + '" placeholder="' + sectionPlaceholders[i] + '" value="' + esc(val) + '"></div>';
      html += '<div class="chips">';
      var chips = allChips[key] || [];
      chips.forEach(function(c) {
        var sel = (val === c) ? ' selected' : '';
        html += '<div class="chip' + sel + '" data-key="' + key + '" data-val="' + esc(c) + '">' + esc(c) + '</div>';
      });
      html += '</div></div></div>';
    }

    // CTA
    html += '<button class="cta"' + (canSearch ? '' : ' disabled') + '>';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
    html += 'Search Experiences</button>';
    html += '</div>';
    root.innerHTML = html;

    // Bind events
    root.querySelectorAll('[data-toggle]').forEach(function(el) {
      el.addEventListener('click', function() {
        activeIdx = parseInt(el.getAttribute('data-toggle'), 10);
        renderUI();
      });
    });

    root.querySelectorAll('.chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var key = chip.getAttribute('data-key');
        var val = chip.getAttribute('data-val');
        selections[key] = val;
        // Advance to next unfilled section
        for (var n = 0; n < sectionKeys.length; n++) {
          if (!selections[sectionKeys[n]]) { activeIdx = n; renderUI(); return; }
        }
        activeIdx = sectionKeys.length;
        renderUI();
      });
    });

    root.querySelectorAll('input[data-key]').forEach(function(inp) {
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && inp.value.trim()) {
          var key = inp.getAttribute('data-key');
          selections[key] = inp.value.trim();
          for (var n = 0; n < sectionKeys.length; n++) {
            if (!selections[sectionKeys[n]]) { activeIdx = n; renderUI(); return; }
          }
          activeIdx = sectionKeys.length;
          renderUI();
        }
      });
    });

    var ctaBtn = root.querySelector('.cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function() {
        if (ctaBtn.disabled) return;
        var parts = ['Search for experiences'];
        if (selections.where) parts.push('in ' + selections.where);
        if (selections.what) parts.push('for "' + selections.what + '"');
        if (selections.when) parts.push(selections.when.toLowerCase());
        if (selections.who) parts.push('for ' + selections.who.toLowerCase());
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: parts.join(' ') } }, '*');
      });
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) {
      render(msg.params.structuredContent || msg.params._meta);
    }
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Trip Planner', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
