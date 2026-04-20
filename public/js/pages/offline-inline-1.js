// ── Back to top visibility ──
    const backToTop = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });

    // ── Online detection ──
    const statusBadge = document.getElementById('status-badge');
    const toast = document.getElementById('reconnect-toast');

    function setOnline() {
      statusBadge.innerHTML = '<span class="status-dot"></span>Back Online';
      statusBadge.classList.add('online');
      toast.classList.add('show');
      setTimeout(() => { window.location.reload(); }, 2000);
    }

    window.addEventListener('online', setOnline);

    // Poll for connection recovery as fallback
    const pollInterval = setInterval(() => {
      if (navigator.onLine) {
        clearInterval(pollInterval);
        setOnline();
      }
    }, 3000);
