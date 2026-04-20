(function() {
  // ── Accordion ──
  window.toggleFAQ = function(btn) {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');

    // Close all others
    document.querySelectorAll('.faq-item.open').forEach(openItem => {
      if (openItem !== item) {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = '0';
        openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      }
    });

    if (isOpen) {
      item.classList.remove('open');
      answer.style.maxHeight = '0';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  };

  // ── Category filter ──
  window.filterCat = function(cat, btn) {
    // Update nav
    document.querySelectorAll('.cat-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide categories
    document.querySelectorAll('.faq-category').forEach(sec => {
      if (cat === 'all' || sec.dataset.cat === cat) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    });

    // Clear search
    const searchEl = document.getElementById('faqSearch');
    searchEl.value = '';
    document.getElementById('searchCount').textContent = '';
    document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('hidden'));
    document.getElementById('noResults').classList.remove('show');
  };

  // ── Search / filter ──
  const searchInput = document.getElementById('faqSearch');
  const searchCount = document.getElementById('searchCount');
  const noResults = document.getElementById('noResults');

  searchInput.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    if (!q) {
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('hidden');
      });
      document.querySelectorAll('.faq-category').forEach(s => s.classList.remove('hidden'));
      searchCount.textContent = '';
      noResults.classList.remove('show');
      // Reset nav to 'all'
      document.querySelectorAll('.cat-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-cat="all"]').classList.add('active');
      return;
    }

    let matchCount = 0;
    document.querySelectorAll('.faq-category').forEach(cat => {
      let catHasMatch = false;
      cat.querySelectorAll('.faq-item').forEach(item => {
        const q_text = item.textContent.toLowerCase();
        if (q_text.includes(q)) {
          item.classList.remove('hidden');
          catHasMatch = true;
          matchCount++;
        } else {
          item.classList.add('hidden');
        }
      });
      if (catHasMatch) { cat.classList.remove('hidden'); } else { cat.classList.add('hidden'); }
    });

    searchCount.textContent = matchCount + ' result' + (matchCount !== 1 ? 's' : '');
    noResults.classList.toggle('show', matchCount === 0);

    // Update active nav
    document.querySelectorAll('.cat-nav-btn').forEach(b => b.classList.remove('active'));
  });
})();
