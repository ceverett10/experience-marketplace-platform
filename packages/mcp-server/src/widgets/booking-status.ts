export const BOOKING_STATUS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Booking Status</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --green: #059669; --yellow-600: #CA8A04; --blue: #2563EB; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  .status-card { text-align: center; padding: 24px 16px; margin-bottom: 16px; }
  .status-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
  .status-icon.confirmed { background: #D1FAE5; color: var(--green); }
  .status-icon.pending { background: #FEF3C7; color: var(--yellow-600); }
  .status-icon.payment { background: #DBEAFE; color: var(--blue); }
  .status-icon.error { background: #FEE2E2; color: #DC2626; }
  .status-icon svg { width: 28px; height: 28px; }
  .status-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .status-sub { font-size: 14px; color: var(--gray-500); }
  .card { border: 1px solid var(--gray-200); border-radius: 12px; background: white; padding: 16px; margin-bottom: 16px; }
  .card-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px solid var(--gray-100); }
  .detail-row:last-child { border-bottom: none; }
  .detail-label { color: var(--gray-500); }
  .detail-value { font-weight: 600; text-align: right; }
  .total-row { display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid var(--gray-200); margin-top: 4px; }
  .total-row .detail-label { font-size: 15px; font-weight: 700; color: var(--gray-900); }
  .total-row .detail-value { font-size: 18px; font-weight: 700; color: var(--primary); }
  .voucher-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border: 2px solid var(--primary); border-radius: 12px; background: white; color: var(--primary); font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .voucher-btn:hover { background: var(--primary); color: white; }
  .voucher-btn svg { width: 20px; height: 20px; }
  .payment-section { padding: 16px; background: var(--gray-50); border-radius: 10px; margin-bottom: 16px; }
  .payment-section .label { font-size: 13px; color: var(--gray-500); margin-bottom: 4px; }
  .payment-section .value { font-size: 14px; font-weight: 600; word-break: break-all; }
  .payment-note { font-size: 13px; color: var(--gray-500); margin-top: 8px; line-height: 1.5; }
  .steps { margin-top: 16px; }
  .steps-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; }
  .step-item { display: flex; gap: 12px; padding: 8px 0; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .step-text { font-size: 13px; color: var(--gray-600); line-height: 1.4; }
  .empty { text-align: center; padding: 48px 16px; color: var(--gray-500); }
</style>
</head>
<body>
<div class="container" id="root"><div class="empty">Loading booking status...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render(data) {
    if (!data) { root.innerHTML = '<div class="container"><div class="empty">No data.</div></div>'; return; }
    if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);

    var html = '<div class="container">';

    // Status header
    var iconClass = 'pending';
    var iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5"/><circle cx="12" cy="12" r="9"/></svg>';
    var title = 'Booking Processing';
    var subtitle = 'Your booking is being processed.';

    if (data.state === 'CONFIRMED' || data.state === 'COMPLETED') {
      iconClass = 'confirmed';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
      title = 'Booking Confirmed!';
      subtitle = 'Your experience is booked and ready.';
    } else if (data.paymentRequired) {
      iconClass = 'payment';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>';
      title = 'Payment Required';
      subtitle = 'Complete payment to finalize your booking.';
    } else if (data.noPaymentRequired) {
      iconClass = 'confirmed';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
      title = 'No Payment Needed';
      subtitle = 'This booking is on-account. Proceed to commit.';
    } else if (data.error) {
      iconClass = 'error';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>';
      title = 'Error';
      subtitle = esc(data.error);
    }

    html += '<div class="status-card"><div class="status-icon ' + iconClass + '">' + iconSvg + '</div>';
    html += '<div class="status-title">' + esc(title) + '</div>';
    html += '<div class="status-sub">' + esc(subtitle) + '</div></div>';

    // Booking details
    if (data.bookingId || data.code) {
      html += '<div class="card"><div class="card-title">Booking Details</div>';
      if (data.code) html += '<div class="detail-row"><span class="detail-label">Booking Code</span><span class="detail-value">' + esc(data.code) + '</span></div>';
      if (data.bookingId) html += '<div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value" style="font-family:monospace;font-size:12px">' + esc(data.bookingId) + '</span></div>';
      if (data.state) html += '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + esc(data.state) + '</span></div>';
      if (data.leadPassenger) html += '<div class="detail-row"><span class="detail-label">Lead Passenger</span><span class="detail-value">' + esc(data.leadPassenger) + '</span></div>';
      if (data.paymentState) html += '<div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">' + esc(data.paymentState) + '</span></div>';

      // Items
      if (data.items && data.items.length) {
        data.items.forEach(function(item) {
          html += '<div class="detail-row"><span class="detail-label">' + esc(item.name) + '</span><span class="detail-value">' + esc(item.date || '') + (item.price ? ' ' + esc(item.price) : '') + '</span></div>';
        });
      }

      if (data.totalPrice) html += '<div class="total-row"><span class="detail-label">Total</span><span class="detail-value">' + esc(data.totalPrice) + '</span></div>';
      html += '</div>';
    }

    // Payment info
    if (data.paymentRequired && data.payment) {
      html += '<div class="card"><div class="card-title">Payment Information</div>';
      html += '<div class="payment-section"><div class="label">Amount</div><div class="value">' + esc(data.payment.amount) + '</div></div>';
      if (data.payment.paymentIntentId) html += '<div class="payment-section"><div class="label">Payment Intent</div><div class="value" style="font-family:monospace;font-size:12px">' + esc(data.payment.paymentIntentId) + '</div></div>';
      html += '<div class="payment-note">Complete payment via Stripe to finalize the booking. Once payment is confirmed, the booking can be committed.</div>';
      html += '</div>';
    }

    // Voucher
    if (data.voucherUrl) {
      html += '<button class="voucher-btn" id="voucher-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Download Voucher</button>';
    }

    // What's next
    if (data.state === 'CONFIRMED' || data.state === 'COMPLETED') {
      html += '<div class="steps"><div class="steps-title">What\\'s Next</div>';
      html += '<div class="step-item"><div class="step-num">1</div><div class="step-text">Download your voucher and save it to your phone</div></div>';
      html += '<div class="step-item"><div class="step-num">2</div><div class="step-text">Show the voucher at the meeting point on the day</div></div>';
      html += '<div class="step-item"><div class="step-num">3</div><div class="step-text">Enjoy your experience!</div></div>';
      html += '</div>';
    }

    html += '</div>';
    root.innerHTML = html;

    var voucherBtn = document.getElementById('voucher-btn');
    if (voucherBtn && data.voucherUrl) {
      voucherBtn.addEventListener('click', function() {
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/openExternal', params: { url: data.voucherUrl } }, '*');
      });
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) render(msg.params.structuredContent || msg.params._meta);
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Status', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
