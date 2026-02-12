export const SEARCH_RESULTS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Experience Search Results</title>
<style>
  :root { --primary: #0F766E; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --yellow: #FACC15; --shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: transparent; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; }
  .header { margin-bottom: 16px; }
  .header h2 { font-size: 18px; font-weight: 700; color: var(--gray-900); }
  .header p { font-size: 13px; color: var(--gray-500); margin-top: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .card { border: 1px solid var(--gray-200); border-radius: 12px; background: white; overflow: hidden; transition: box-shadow 0.2s, transform 0.2s; cursor: pointer; }
  .card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
  .card-img { position: relative; width: 100%; aspect-ratio: 4/3; overflow: hidden; background: var(--gray-100); }
  .card-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
  .card:hover .card-img img { transform: scale(1.05); }
  .badge { position: absolute; top: 8px; left: 8px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; color: white; }
  .badge-bestseller { background: #F59E0B; }
  .badge-new { background: #7C3AED; }
  .badge-recommended { background: #0D9488; }
  .badge-free-cancel { background: #059669; }
  .rating-badge { position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.95); border-radius: 6px; padding: 3px 8px; display: flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; }
  .star { color: var(--yellow); width: 14px; height: 14px; }
  .card-body { padding: 12px; }
  .card-title { font-size: 14px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; }
  .card-location { font-size: 12px; color: var(--gray-500); display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
  .card-location svg { width: 12px; height: 12px; flex-shrink: 0; }
  .card-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--gray-600); margin-bottom: 8px; }
  .card-meta svg { width: 14px; height: 14px; flex-shrink: 0; }
  .card-meta .duration { display: flex; align-items: center; gap: 3px; }
  .card-meta .reviews { display: flex; align-items: center; gap: 3px; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; border-top: 1px solid var(--gray-100); }
  .price { font-size: 15px; font-weight: 700; color: var(--primary); }
  .price-label { font-size: 11px; color: var(--gray-500); font-weight: 400; }
  .view-btn { font-size: 12px; font-weight: 600; color: var(--primary); background: none; border: 1px solid var(--primary); border-radius: 8px; padding: 6px 12px; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .view-btn:hover { background: var(--primary); color: white; }
  .empty { text-align: center; padding: 48px 16px; }
  .empty p { color: var(--gray-500); font-size: 14px; }
  .load-more { display: block; width: 100%; margin-top: 16px; padding: 12px; border: 1px solid var(--gray-200); border-radius: 10px; background: white; color: var(--gray-600); font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .load-more:hover { background: var(--gray-50); }
</style>
</head>
<body>
<div class="container" id="root">
  <div class="empty"><p>Loading experiences...</p></div>
</div>
<script>
(function() {
  const root = document.getElementById('root');

  function starSvg() {
    return '<svg class="star" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';
  }

  function render(data) {
    if (!data || !data.experiences || !data.experiences.length) {
      root.innerHTML = '<div class="empty"><p>No experiences found. Try a different destination or search term.</p></div>';
      return;
    }
    if (data.brand && data.brand.primaryColor) {
      document.documentElement.style.setProperty('--primary', data.brand.primaryColor);
    }
    let html = '<div class="header"><h2>Experiences' + (data.destination ? ' in ' + esc(data.destination) : '') + '</h2>';
    html += '<p>' + data.experiences.length + ' results found' + (data.hasMore ? ' (more available)' : '') + '</p></div>';
    html += '<div class="grid">';
    data.experiences.forEach(function(exp) {
      html += '<div class="card" data-id="' + esc(exp.id) + '">';
      html += '<div class="card-img">';
      if (exp.imageUrl) html += '<img src="' + esc(exp.imageUrl) + '" alt="' + esc(exp.name) + '" loading="lazy">';
      if (exp.badge) html += '<span class="badge badge-' + esc(exp.badgeClass || 'recommended') + '">' + esc(exp.badge) + '</span>';
      if (exp.rating) html += '<div class="rating-badge">' + starSvg() + '<span>' + exp.rating.toFixed(1) + '</span></div>';
      html += '</div>';
      html += '<div class="card-body">';
      html += '<div class="card-title">' + esc(exp.name) + '</div>';
      if (exp.location) html += '<div class="card-location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z"/></svg>' + esc(exp.location) + '</div>';
      html += '<div class="card-meta">';
      if (exp.duration) html += '<span class="duration"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' + esc(exp.duration) + '</span>';
      if (exp.reviewCount) html += '<span class="reviews">' + starSvg() + exp.reviewCount + ' reviews</span>';
      html += '</div>';
      html += '<div class="card-footer">';
      if (exp.price) html += '<div class="price"><span class="price-label">From </span>' + esc(exp.price) + '</div>';
      html += '<button class="view-btn" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '">View Details</button>';
      html += '</div></div></div>';
    });
    html += '</div>';
    if (data.hasMore) html += '<button class="load-more">Load More Experiences</button>';
    root.innerHTML = html;

    root.querySelectorAll('.view-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-id');
        var name = btn.getAttribute('data-name');
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { message: 'Show me details for "' + name + '" (ID: ' + id + ')' } }, '*');
      });
    });
  }

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) {
      render(msg.params.structuredContent || msg.params._meta);
    }
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Search', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
