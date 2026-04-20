function filterCat(btn) {
      document.querySelectorAll('.cat-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.textContent.trim().toLowerCase();
      const articles = document.querySelectorAll('.article-card');
      const featured = document.querySelector('.featured-article');
      let shown = 0;
      articles.forEach(article => {
        if (cat === 'all') { article.style.display = ''; shown++; return; }
        const badge = article.querySelector('.featured-cat-badge');
        const badgeText = badge ? badge.textContent.trim().toLowerCase() : '';
        const match = badgeText.includes(cat.replace(/s$/, ''));
        article.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      if (featured) featured.style.display = (cat === 'all' || cat === 'game updates') ? '' : 'none';
      const loadBtn = document.querySelector('.load-more-btn');
      if (loadBtn) { loadBtn.disabled = false; loadBtn.style.opacity = '1'; loadBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Load More Articles'; }
    }
    (function() {
      const grid = document.querySelector('.news-grid');
      if (!grid) return;
      const articles = grid.querySelectorAll('.article-card');
      const PAGE = 6;
      articles.forEach((a, i) => { if (i >= PAGE) a.classList.add('load-hidden'); });
      window.loadMore = function(btn) {
        const hidden = grid.querySelectorAll('.article-card.load-hidden');
        const batch = Array.from(hidden).slice(0, PAGE);
        batch.forEach(a => a.classList.remove('load-hidden'));
        if (grid.querySelectorAll('.article-card.load-hidden').length === 0) {
          btn.textContent = 'All articles loaded';
          btn.disabled = true;
          btn.style.opacity = '0.5';
        }
      };
    })();
