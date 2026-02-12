export const BOOKING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Booking</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --green: #059669; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  .card { border: 1px solid var(--gray-200); border-radius: 12px; background: white; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: var(--gray-500); margin-bottom: 16px; }
  .booking-info { margin-bottom: 12px; }
  .info-line { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 14px; }
  .info-line svg { width: 16px; height: 16px; color: var(--gray-500); flex-shrink: 0; }
  .info-label { color: var(--gray-500); min-width: 80px; }
  .info-value { font-weight: 600; }
  .items { margin-top: 12px; }
  .item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-100); font-size: 14px; }
  .item:last-child { border-bottom: none; }
  .item-name { font-weight: 600; }
  .item-detail { font-size: 12px; color: var(--gray-500); }
  .item-price { font-weight: 700; color: var(--primary); }
  .total { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid var(--gray-200); margin-top: 8px; }
  .total-label { font-size: 15px; font-weight: 700; }
  .total-price { font-size: 18px; font-weight: 700; color: var(--primary); }
  .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
  .form-group { margin-bottom: 12px; }
  .form-label { font-size: 13px; font-weight: 600; color: var(--gray-600); margin-bottom: 4px; display: block; }
  .required { color: #DC2626; }
  input { width: 100%; padding: 10px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 14px; color: var(--gray-900); transition: border-color 0.15s; }
  input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(15,118,110,0.2); }
  .answered-value { font-size: 14px; padding: 8px 12px; background: var(--gray-50); border-radius: 8px; color: var(--gray-600); }
  .ready-badge { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #ECFDF5; border-radius: 10px; color: var(--green); font-size: 14px; font-weight: 600; margin-bottom: 12px; }
  .ready-badge svg { width: 20px; height: 20px; flex-shrink: 0; }
  .remaining { padding: 12px 16px; background: #FEF3C7; border-radius: 10px; font-size: 13px; color: #92400E; margin-bottom: 12px; }
  .cta { display: block; width: 100%; padding: 14px; border: none; border-radius: 12px; background: var(--primary); color: white; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; transition: opacity 0.15s; }
  .cta:hover { opacity: 0.9; }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .empty { text-align: center; padding: 48px 16px; color: var(--gray-500); }
</style>
</head>
<body>
<div class="container" id="root"><div class="empty">Loading booking...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render(data) {
    if (!data || !data.booking) { root.innerHTML = '<div class="container"><div class="empty">No booking data.</div></div>'; return; }
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);
    var b = data.booking;
    var html = '<div class="container">';

    // Summary card
    html += '<div class="card"><h2>Booking ' + esc(b.code || '') + '</h2>';
    html += '<div class="booking-info">';
    html += '<div class="info-line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg><span class="info-label">ID</span><span class="info-value" style="font-family:monospace;font-size:12px">' + esc(b.id) + '</span></div>';
    html += '<div class="info-line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"/></svg><span class="info-label">State</span><span class="info-value">' + esc(b.state || 'OPEN') + '</span></div>';
    html += '</div>';

    // Items
    if (b.items && b.items.length) {
      html += '<div class="items">';
      b.items.forEach(function(item) {
        html += '<div class="item"><div><div class="item-name">' + esc(item.name) + '</div>';
        html += '<div class="item-detail">' + esc(item.date || '') + (item.startTime ? ' at ' + esc(item.startTime) : '') + '</div></div>';
        if (item.price) html += '<div class="item-price">' + esc(item.price) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (b.totalPrice) html += '<div class="total"><span class="total-label">Total</span><span class="total-price">' + esc(b.totalPrice) + '</span></div>';
    html += '</div>';

    // Ready state
    if (b.canCommit) {
      html += '<div class="ready-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Ready to commit! All questions answered.</div>';
    }

    // Remaining required questions
    if (data.remainingQuestions && data.remainingQuestions.length) {
      html += '<div class="remaining">Still need answers for: ' + data.remainingQuestions.map(esc).join(', ') + '</div>';
    }

    // Questions form
    if (data.questions && data.questions.length) {
      html += '<div class="card"><div class="section-title">Guest Details</div>';
      data.questions.forEach(function(q) {
        html += '<div class="form-group"><label class="form-label">' + esc(q.label);
        if (q.required) html += ' <span class="required">*</span>';
        html += '</label>';
        if (q.answered) {
          html += '<div class="answered-value">' + esc(q.answerValue) + '</div>';
        } else if (q.options && q.options.length) {
          html += '<select data-q-id="' + esc(q.id) + '">';
          html += '<option value="">Select...</option>';
          q.options.forEach(function(o) { html += '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; });
          html += '</select>';
        } else {
          html += '<input type="' + (q.type === 'EMAIL' ? 'email' : q.type === 'PHONE' ? 'tel' : 'text') + '" data-q-id="' + esc(q.id) + '" placeholder="' + esc(q.placeholder || '') + '"' + (q.autoComplete ? ' value="' + esc(q.autoComplete) + '"' : '') + '>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Action button
    if (b.canCommit) {
      html += '<button class="cta" id="commit-btn">Proceed to Payment</button>';
    } else if (data.nextStep) {
      html += '<button class="cta" id="next-btn">' + esc(data.nextStep) + '</button>';
    }

    html += '</div>';
    root.innerHTML = html;

    var commitBtn = document.getElementById('commit-btn');
    if (commitBtn) {
      commitBtn.addEventListener('click', function() {
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: 'Check payment info and commit booking ' + (b.id || '') } }, '*');
      });
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) render(msg.params.structuredContent || msg.params._meta);
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Booking', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
