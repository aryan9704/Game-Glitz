// Particles
    (function() {
      const container = document.getElementById('particles');
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 4 + 2;
        p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;animation-duration:${Math.random()*10+8}s;animation-delay:${Math.random()*8}s;opacity:0;`;
        if (Math.random() > 0.5) p.style.background = '#06B6D4';
        container.appendChild(p);
      }
    })();

    // Tab switching
    function setTab(btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.textContent.trim().toLowerCase();
      const sections = document.querySelectorAll('[data-tab]');
      const dividers = document.querySelectorAll('.section-divider');
      if (tab === 'forums') {
        sections.forEach(s => s.style.display = '');
        dividers.forEach(d => d.style.display = '');
      } else {
        sections.forEach(s => {
          s.style.display = s.dataset.tab === tab ? '' : 'none';
        });
        dividers.forEach(d => d.style.display = 'none');
      }
      applyCommunitySearch();
    }

    function applyCommunitySearch() {
      const input = document.getElementById('communitySearchInput');
      const noResults = document.getElementById('communityNoResults');
      if (!input || !noResults) return;
      const q = input.value.trim().toLowerCase();
      const cards = document.querySelectorAll('.forum-thread, .group-card, .event-card, .clip-card, .lfg-card');

      let visible = 0;
      cards.forEach((card) => {
        const section = card.closest('[data-tab]');
        const sectionVisible = !section || section.style.display !== 'none';
        const text = (card.textContent || '').toLowerCase();
        const match = !q || text.includes(q);
        const show = sectionVisible && match;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      noResults.classList.toggle('visible', visible === 0 && q.length > 0);
    }

    // Auto-select tab from URL hash (e.g. #events, #groups)
    (function() {
      const hash = location.hash.replace('#', '').toLowerCase();
      if (hash) {
        const tabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.trim().toLowerCase() === hash);
        if (tabBtn) setTab(tabBtn);
      }
    })();

    document.getElementById('communitySearchInput')?.addEventListener('input', applyCommunitySearch);
