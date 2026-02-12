export const EXPERIENCE_CAROUSEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Experiences</title>
<style>
  :root { --primary: #0F766E; --primary-light: #F0FDFA; --gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-400: #9CA3AF; --gray-500: #6B7280; --gray-600: #4B5563; --gray-900: #111827; --yellow: #FACC15; --shadow: 0 4px 12px rgba(0,0,0,0.08); --card-w: 260px; --gap: 16px; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--gray-900); background: white; -webkit-font-smoothing: antialiased; }
  .container { padding: 16px; background: white; border-radius: 12px; }
  .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .header h2 { font-size: 18px; font-weight: 700; }
  .header .count { font-size: 13px; color: var(--gray-500); }
  .carousel { position: relative; }
  .viewport { overflow: hidden; }
  .track { display: flex; gap: var(--gap); transition: transform 0.3s ease-out; }
  .card { width: var(--card-w); flex-shrink: 0; border: 1px solid var(--gray-200); border-radius: 12px; background: white; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s, transform 0.2s; }
  .card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
  .card-img { position: relative; width: 100%; aspect-ratio: 4/3; background: var(--gray-100); overflow: hidden; }
  .card-img img { width: 100%; height: 100%; object-fit: cover; }
  .badge { position: absolute; top: 8px; left: 8px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: var(--primary); color: white; }
  .rating-badge { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 3px; padding: 3px 7px; border-radius: 6px; font-size: 12px; font-weight: 700; background: rgba(0,0,0,0.6); color: white; }
  .star { color: var(--yellow); }
  .card-body { padding: 12px; }
  .card-title { font-size: 14px; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; min-height: 36px; }
  .card-loc { font-size: 12px; color: var(--gray-500); display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .card-loc svg { width: 12px; height: 12px; flex-shrink: 0; }
  .card-meta { font-size: 12px; color: var(--gray-500); display: flex; gap: 12px; margin-bottom: 8px; }
  .card-meta span { display: flex; align-items: center; gap: 3px; }
  .card-meta svg { width: 12px; height: 12px; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; padding: 0 12px 12px; }
  .price { font-size: 15px; font-weight: 700; color: var(--primary); }
  .price-label { font-size: 11px; color: var(--gray-500); font-weight: 400; }
  .view-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--primary); background: transparent; color: var(--primary); font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .view-btn:hover { background: var(--primary); color: white; }
  .nav-btn { position: absolute; top: 50%; transform: translateY(-80%); width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--gray-200); background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.15s; }
  .nav-btn:hover { background: var(--gray-50); }
  .nav-btn.left { left: -12px; }
  .nav-btn.right { right: -12px; }
  .nav-btn.hidden { display: none; }
  .nav-btn svg { width: 16px; height: 16px; color: var(--gray-600); }
  .load-more { width: var(--card-w); flex-shrink: 0; border: 2px dashed var(--gray-200); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; min-height: 280px; transition: border-color 0.15s, background 0.15s; }
  .load-more:hover { border-color: var(--primary); background: var(--primary-light); }
  .load-more svg { width: 32px; height: 32px; color: var(--gray-400); }
  .load-more:hover svg { color: var(--primary); }
  .load-more span { font-size: 13px; font-weight: 600; color: var(--gray-500); }
  .load-more:hover span { color: var(--primary); }
  .empty { text-align: center; padding: 48px 16px; color: var(--gray-500); }
</style>
</head>
<body>
<div class="container" id="root"><div class="empty">Loading experiences...</div></div>
<script>
(function() {
  var root = document.getElementById('root');
  var allExperiences = [];
  var seenIds = {};
  var currentIndex = 0;
  var destination = '';
  var hasMore = false;

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render() {
    if (!allExperiences.length) { root.innerHTML = '<div class="container"><div class="empty">No experiences found. Try different search terms.</div></div>'; return; }

    var html = '<div class="container">';
    html += '<div class="header"><h2>Experiences' + (destination ? ' in ' + esc(destination) : '') + '</h2><span class="count">' + allExperiences.length + ' found</span></div>';
    html += '<div class="carousel">';

    // Nav buttons
    html += '<button class="nav-btn left' + (currentIndex <= 0 ? ' hidden' : '') + '" data-dir="left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>';

    html += '<div class="viewport"><div class="track" id="track">';

    allExperiences.forEach(function(exp) {
      var imgUrl = exp.imageUrl || '';
      var badge = exp.isBestSeller ? 'Best Seller' : '';
      html += '<div class="card" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '">';
      html += '<div class="card-img">';
      if (imgUrl) html += '<img src="' + esc(imgUrl) + '" alt="" loading="lazy">';
      if (badge) html += '<div class="badge">' + esc(badge) + '</div>';
      if (exp.rating) html += '<div class="rating-badge"><span class="star">\\u2605</span>' + exp.rating + '</div>';
      html += '</div>';
      html += '<div class="card-body">';
      html += '<div class="card-title">' + esc(exp.name) + '</div>';
      if (exp.location) html += '<div class="card-loc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(exp.location) + '</div>';
      html += '<div class="card-meta">';
      if (exp.duration) html += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + esc(exp.duration) + '</span>';
      if (exp.reviewCount) html += '<span>' + exp.reviewCount + ' reviews</span>';
      html += '</div></div>';
      html += '<div class="card-footer">';
      if (exp.price) html += '<div class="price"><span class="price-label">From </span>' + esc(exp.price) + '</div>';
      html += '<button class="view-btn" data-id="' + esc(exp.id) + '" data-name="' + esc(exp.name) + '">Details</button>';
      html += '</div></div>';
    });

    if (hasMore) {
      html += '<div class="load-more" id="loadMore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg><span>Show more</span></div>';
    }

    html += '</div></div>'; // track + viewport

    // Right nav
    html += '<button class="nav-btn right" data-dir="right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>';

    html += '</div></div>'; // carousel + container
    root.innerHTML = html;

    updateScroll();
    bindEvents();
  }

  function updateScroll() {
    var track = document.getElementById('track');
    if (!track) return;
    var cardW = 260 + 16;
    track.style.transform = 'translateX(-' + (currentIndex * cardW) + 'px)';
    var viewport = track.parentElement;
    var visibleCount = Math.floor((viewport.offsetWidth || 500) / cardW);
    var maxIdx = Math.max(0, allExperiences.length + (hasMore ? 1 : 0) - visibleCount);
    var leftBtn = root.querySelector('.nav-btn.left');
    var rightBtn = root.querySelector('.nav-btn.right');
    if (leftBtn) leftBtn.classList.toggle('hidden', currentIndex <= 0);
    if (rightBtn) rightBtn.classList.toggle('hidden', currentIndex >= maxIdx);
  }

  function bindEvents() {
    root.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dir = btn.getAttribute('data-dir');
        if (dir === 'left') currentIndex = Math.max(0, currentIndex - 1);
        else currentIndex++;
        updateScroll();
      });
    });

    root.querySelectorAll('.card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.view-btn')) return;
        var id = card.getAttribute('data-id');
        var name = card.getAttribute('data-name');
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Show me details for "' + name + '" (ID: ' + id + ')' }] } }, '*');
      });
    });

    root.querySelectorAll('.view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-id');
        var name = btn.getAttribute('data-name');
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Show me details for "' + name + '" (ID: ' + id + ')' }] } }, '*');
      });
    });

    var loadMore = document.getElementById('loadMore');
    if (loadMore) {
      loadMore.addEventListener('click', function() {
        window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Show me more experiences like these' }] } }, '*');
      });
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (msg && msg.method === 'ui/notifications/tool-result' && msg.params) {
      var data = msg.params.structuredContent || msg.params._meta;
      if (!data || !data.experiences) return;
      if (data.brand && data.brand.primaryColor) document.documentElement.style.setProperty('--primary', data.brand.primaryColor);
      destination = data.destination || destination;
      hasMore = data.hasMore || false;
      // Accumulate experiences, deduplicate
      data.experiences.forEach(function(exp) {
        if (!seenIds[exp.id]) {
          seenIds[exp.id] = true;
          allExperiences.push(exp);
        }
      });
      render();
    }
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: { appInfo: { name: 'Holibob Carousel', version: '1.0.0' } } }, '*');
})();
</script>
</body>
</html>`;
