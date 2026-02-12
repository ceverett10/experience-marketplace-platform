export const SLOT_CONFIG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Configure Slot</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --green: #059669; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  h2 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: var(--gray-500); margin-bottom: 16px; }
  .steps { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  .step { display: flex; align-items: center; gap: 6px; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  .step-num.active { background: var(--primary); color: white; }
  .step-num.done { background: #D1FAE5; color: var(--green); }
  .step-num.pending { background: var(--gray-200); color: var(--gray-500); }
  .step-label { font-size: 12px; font-weight: 600; color: var(--gray-500); }
  .step-label.active { color: var(--primary); }
  .step-divider { width: 20px; height: 2px; background: var(--gray-200); }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .complete-badge { font-size: 11px; font-weight: 600; color: var(--green); background: #ECFDF5; padding: 2px 8px; border-radius: 6px; }
  .option-group { margin-bottom: 12px; }
  .option-label { font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; }
  select { width: 100%; padding: 10px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 14px; color: var(--gray-900); background: white; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 20px; cursor: pointer; transition: border-color 0.15s; }
  select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.2); }
  .answered { font-size: 13px; color: var(--gray-600); padding: 8px 12px; background: var(--gray-50); border-radius: 8px; }
  .pricing-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--gray-100); }
  .pricing-row:last-child { border-bottom: none; }
  .pricing-info { flex: 1; }
  .pricing-name { font-size: 14px; font-weight: 600; }
  .pricing-detail { font-size: 12px; color: var(--gray-500); margin-top: 2px; }
  .pricing-unit { font-size: 13px; color: var(--primary); font-weight: 600; }
  .counter { display: flex; align-items: center; gap: 0; }
  .counter button { width: 32px; height: 32px; border: 1px solid var(--gray-200); background: white; cursor: pointer; font-size: 16px; font-weight: 700; color: var(--gray-600); display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
  .counter button:first-child { border-radius: 8px 0 0 8px; }
  .counter button:last-child { border-radius: 0 8px 8px 0; }
  .counter button:hover { background: var(--gray-50); }
  .counter button:disabled { opacity: 0.3; cursor: not-allowed; }
  .counter .count { width: 40px; height: 32px; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
  .total-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--primary-light); border-radius: 10px; margin-top: 12px; }
  .total-label { font-size: 14px; font-weight: 600; }
  .total-price { font-size: 18px; font-weight: 700; color: var(--primary); }
  .ready-badge { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #ECFDF5; border-radius: 10px; margin-top: 12px; color: var(--green); font-size: 14px; font-weight: 600; }
  .ready-badge svg { width: 20px; height: 20px; }
  .empty { text-align: center; padding: 48px 16px; color: var(--gray-500); }
</style>
</head>
<body>
<div class="container" id="root"><div class="empty">Loading slot configuration...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render(data) {
    if (!data) { root.innerHTML = '<div class="container"><div class="empty">No slot data.</div></div>'; return; }
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);

    var hasOptions = data.options && data.options.length;
    var hasPricing = data.pricingCategories && data.pricingCategories.length;
    var optionsComplete = data.optionsComplete;

    var html = '<div class="container">';
    html += '<h2>Configure Your Experience</h2>';
    html += '<div class="subtitle">Slot: ' + esc(data.date || '') + (data.startTime ? ' at ' + esc(data.startTime) : '') + '</div>';

    // Steps
    html += '<div class="steps">';
    html += '<div class="step"><div class="step-num ' + (optionsComplete ? 'done' : 'active') + '">' + (optionsComplete ? '\\u2713' : '1') + '</div><span class="step-label ' + (!optionsComplete ? 'active' : '') + '">Options</span></div>';
    html += '<div class="step-divider"></div>';
    html += '<div class="step"><div class="step-num ' + (hasPricing && optionsComplete ? 'active' : 'pending') + '">2</div><span class="step-label ' + (hasPricing && optionsComplete ? 'active' : '') + '">Guests</span></div>';
    html += '<div class="step-divider"></div>';
    html += '<div class="step"><div class="step-num ' + (data.isValid ? 'done' : 'pending') + '">' + (data.isValid ? '\\u2713' : '3') + '</div><span class="step-label">Ready</span></div>';
    html += '</div>';

    // Options
    if (hasOptions) {
      var unanswered = data.options.filter(function(o) { return !o.answered; });
      var answered = data.options.filter(function(o) { return o.answered; });

      html += '<div class="section"><div class="section-title">Select Options';
      if (optionsComplete) html += ' <span class="complete-badge">Complete</span>';
      html += '</div>';

      if (unanswered.length) {
        unanswered.forEach(function(opt) {
          html += '<div class="option-group"><div class="option-label">' + esc(opt.label) + '</div>';
          if (opt.choices && opt.choices.length) {
            html += '<select data-opt-id="' + esc(opt.id) + '">';
            html += '<option value="">Select...</option>';
            opt.choices.forEach(function(c) { html += '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>'; });
            html += '</select>';
          }
          html += '</div>';
        });
      }
      if (answered.length) {
        answered.forEach(function(opt) {
          html += '<div class="option-group"><div class="option-label">' + esc(opt.label) + '</div>';
          html += '<div class="answered">' + esc(opt.answerText || opt.answerValue) + '</div></div>';
        });
      }
      html += '</div>';
    }

    // Pricing
    if (hasPricing) {
      html += '<div class="section"><div class="section-title">Participants</div>';
      data.pricingCategories.forEach(function(cat) {
        html += '<div class="pricing-row">';
        html += '<div class="pricing-info"><div class="pricing-name">' + esc(cat.label) + '</div>';
        html += '<div class="pricing-detail">' + esc(cat.unitPrice || '') + ' per person';
        if (cat.min != null || cat.max != null) html += ' (min: ' + (cat.min || 0) + ', max: ' + (cat.max || '\\u221e') + ')';
        html += '</div></div>';
        html += '<div class="counter">';
        html += '<button data-cat="' + esc(cat.id) + '" data-action="dec" ' + (cat.units <= (cat.min || 0) ? 'disabled' : '') + '>\\u2212</button>';
        html += '<div class="count" data-cat-count="' + esc(cat.id) + '">' + (cat.units || 0) + '</div>';
        html += '<button data-cat="' + esc(cat.id) + '" data-action="inc" ' + (cat.max != null && cat.units >= cat.max ? 'disabled' : '') + '>+</button>';
        html += '</div></div>';
      });
      if (data.totalPrice) html += '<div class="total-row"><span class="total-label">Total</span><span class="total-price">' + esc(data.totalPrice) + '</span></div>';
      html += '</div>';
    }

    // Ready state
    if (data.isValid) {
      html += '<div class="ready-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Ready to book! Create a booking and add this slot.</div>';
    }

    html += '</div>';
    root.innerHTML = html;

    // Note: Select changes and counter buttons dispatch ui/message to prompt the model
    root.querySelectorAll('select[data-opt-id]').forEach(function(sel) {
      sel.addEventListener('change', function() {
        if (!sel.value) return;
        var optId = sel.getAttribute('data-opt-id');
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: 'Set option ' + optId + ' to value "' + sel.value + '" for slot ' + (data.slotId || '') } }, '*');
      });
    });

    root.querySelectorAll('.counter button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var catId = btn.getAttribute('data-cat');
        var action = btn.getAttribute('data-action');
        var countEl = root.querySelector('[data-cat-count="' + catId + '"]');
        var current = parseInt(countEl.textContent, 10) || 0;
        var next = action === 'inc' ? current + 1 : Math.max(0, current - 1);
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: 'Set ' + catId + ' to ' + next + ' units for slot ' + (data.slotId || '') } }, '*');
      });
    });
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) render(msg.params.structuredContent || msg.params._meta);
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Slot Config', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
