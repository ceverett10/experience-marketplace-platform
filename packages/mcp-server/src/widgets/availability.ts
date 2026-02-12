export const AVAILABILITY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Available Dates</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --red: #DC2626; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  .header { margin-bottom: 16px; }
  .header h2 { font-size: 18px; font-weight: 700; }
  .header p { font-size: 13px; color: var(--gray-500); margin-top: 4px; }
  .slots { display: flex; flex-direction: column; gap: 8px; }
  .slot { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border: 2px solid var(--gray-200); border-radius: 10px; background: white; cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s; }
  .slot:hover { border-color: var(--primary); background: var(--primary-light); }
  .slot.sold-out { opacity: 0.5; cursor: not-allowed; }
  .slot.sold-out:hover { border-color: var(--gray-200); background: white; }
  .slot-left { display: flex; flex-direction: column; gap: 2px; }
  .slot-date { font-size: 15px; font-weight: 600; }
  .slot-day { font-size: 12px; color: var(--gray-500); }
  .slot-right { display: flex; align-items: center; gap: 12px; }
  .slot-price { font-size: 15px; font-weight: 700; color: var(--primary); }
  .sold-out-badge { font-size: 11px; font-weight: 600; color: var(--red); background: #FEF2F2; padding: 3px 8px; border-radius: 6px; }
  .slot-arrow { color: var(--gray-500); width: 20px; height: 20px; }
  .empty { text-align: center; padding: 48px 16px; }
  .empty p { color: var(--gray-500); font-size: 14px; }
</style>
</head>
<body>
<div class="container" id="root"><div class="empty"><p>Loading availability...</p></div></div>
<script>
(function() {
  var root = document.getElementById('root');
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr + 'T00:00:00');
      var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { formatted: d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear(), day: days[d.getDay()] };
    } catch(e) { return { formatted: dateStr, day: '' }; }
  }

  function render(data) {
    if (!data || !data.slots || !data.slots.length) {
      root.innerHTML = '<div class="container"><div class="empty"><p>No available dates found in this range. Try different dates.</p></div></div>';
      return;
    }
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);
    var html = '<div class="container"><div class="header"><h2>Available Dates</h2><p>' + data.slots.length + ' dates available</p></div>';
    html += '<div class="slots">';
    data.slots.forEach(function(slot) {
      var dt = formatDate(slot.date);
      var isSoldOut = slot.soldOut;
      html += '<div class="slot' + (isSoldOut ? ' sold-out' : '') + '" data-id="' + esc(slot.id) + '" data-date="' + esc(slot.date) + '">';
      html += '<div class="slot-left"><div class="slot-date">' + esc(dt.formatted) + '</div><div class="slot-day">' + esc(dt.day) + '</div></div>';
      html += '<div class="slot-right">';
      if (isSoldOut) { html += '<span class="sold-out-badge">SOLD OUT</span>'; }
      else {
        if (slot.price) html += '<span class="slot-price">' + esc(slot.price) + '</span>';
        html += '<svg class="slot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
    root.innerHTML = html;

    root.querySelectorAll('.slot:not(.sold-out)').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-id');
        var date = el.getAttribute('data-date');
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: 'I want to select the slot on ' + date + ' (Slot ID: ' + id + '). Please show me the options for this slot.' } }, '*');
      });
    });
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) render(msg.params.structuredContent || msg.params._meta);
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Availability', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
