(function () {
      const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      const params = new URLSearchParams(location.search);
      const token = params.get('token') || '';
      const form = document.getElementById('resetForm');
      const msg = document.getElementById('rpMsg');
      const btn = document.getElementById('rpSubmit');

      function trimTrailingSlash(value = '') {
        return String(value).replace(/\/+$/, '');
      }

      function isLoopbackHost(hostname = '') {
        return LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
      }

      function resolveServerOrigin() {
        const metaOrigin = document.querySelector('meta[name="gg-api-origin"]')?.content;
        const override = trimTrailingSlash(window.GG_API_ORIGIN || metaOrigin || '');
        if (override) return override;
        if (window.location.protocol === 'file:') return 'http://localhost:3000';
        if (isLoopbackHost(window.location.hostname) && window.location.port && window.location.port !== '3000') {
          return `${window.location.protocol}//${window.location.hostname}:3000`;
        }
        return trimTrailingSlash(window.location.origin);
      }

      const serverOrigin = resolveServerOrigin();

      function apiUrl(path = '') {
        const normalized = String(path).startsWith('/') ? String(path) : `/${path}`;
        return normalized.startsWith('/api/') ? serverOrigin + normalized : serverOrigin + '/api' + normalized;
      }

      function show(type, text) {
        msg.className = 'rp-msg ' + type;
        msg.textContent = text;
        msg.style.display = 'block';
      }

      if (!token) {
        show('err', 'Missing reset token. Request a new password reset link.');
        btn.disabled = true;
        return;
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('rp-password').value;
        const confirm  = document.getElementById('rp-confirm').value;
        if (password !== confirm) { show('err', 'Passwords don\u2019t match.'); return; }
        btn.disabled = true;
        btn.textContent = 'Saving\u2026';
        try {
          const r = await fetch(apiUrl('/auth/reset-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { show('err', data.error || 'Could not reset password.'); btn.disabled = false; btn.textContent = 'Set new password'; return; }
          show('ok', 'Password updated. You can now sign in with your new password.');
          btn.textContent = 'Done';
          setTimeout(() => location.href = '/account.html', 1800);
        } catch (err) {
          show('err', 'Network error. Try again.');
          btn.disabled = false;
          btn.textContent = 'Set new password';
        }
      });
    })();
