/* ══ Billing Toggle ══ */
    let billingMode = 'monthly';

    function setBilling(mode) {
      billingMode = mode;
      document.getElementById('toggle-monthly').classList.toggle('active', mode === 'monthly');
      document.getElementById('toggle-annual').classList.toggle('active', mode === 'annual');

      document.querySelectorAll('.pricing-card__price .amount').forEach(el => {
        const val = parseFloat(el.dataset[mode]);
        el.textContent = val === 0 ? '$0' : '$' + val.toFixed(2);
      });

      GG.Toast.info(mode === 'annual'
        ? 'Annual billing selected — save 20%!'
        : 'Monthly billing selected.');
    }

    document.getElementById('toggle-monthly')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') setBilling('monthly');
    });

    /* ══ FAQ Accordion ══ */
    function toggleFAQ(id) {
      const item = document.getElementById(id);
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      // Open clicked if was closed
      if (!isOpen) {
        item.classList.add('open');
        item.querySelector('.faq-question').setAttribute('aria-expanded', 'true');
      }
    }

    /* ══ Scroll Reveal ══ */
    (function () {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.08 });

      document.querySelectorAll('[data-reveal]').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(28px)';
        el.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)';
        io.observe(el);
      });
    })();
