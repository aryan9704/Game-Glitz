// Show current path
    document.getElementById('errPath').textContent = 'path: ' + window.location.pathname;

    // Easter egg: keypress to respawn
    let keyPressed = false;
    document.addEventListener('keydown', function(e) {
      // Ignore modifier-only keys and tab
      if (keyPressed || e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      keyPressed = true;

      const overlay = document.getElementById('respawnOverlay');
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      overlay.focus();

      function trapFocus(event) {
        if (event.key === 'Tab') {
          event.preventDefault();
          overlay.focus();
        }
      }
      document.addEventListener('keydown', trapFocus, true);

      // Flash effect
      document.body.style.transition = 'background 0.1s';
      document.body.style.background = 'rgba(139,92,246,0.2)';
      setTimeout(() => {
        document.body.style.background = '';
      }, 150);

      // Redirect after animation
      setTimeout(() => {
        document.removeEventListener('keydown', trapFocus, true);
        window.location.href = 'index.html';
      }, 800);
    });

    // Search
    function handleSearch(e) {
      if (e.key === 'Enter') doSearch();
    }
    function doSearch() {
      const q = document.getElementById('searchInput').value.trim();
      if (q) window.location.href = 'store.html?search=' + encodeURIComponent(q);
    }
