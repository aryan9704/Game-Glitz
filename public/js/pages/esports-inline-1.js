(function() {
  // Register / Watch buttons
  document.querySelectorAll('.btn-primary, .btn-ghost, .register-btn').forEach(btn => {
    if (btn.tagName === 'A' && btn.getAttribute('href') === '#') {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const text = this.textContent.trim();
        if (text.includes('Register') || text.includes('Enter')) {
          if (window.GG && GG.Toast) GG.Toast.success('Registration noted! Check your email for confirmation.');
          else alert('Registration noted! Check your email for confirmation.');
        } else if (text.includes('Watch')) {
          if (window.GG && GG.Toast) GG.Toast.info('Stream will be available when the match goes live.');
          else alert('Stream will be available when the match goes live.');
        } else if (text.includes('View All') || text.includes('Full')) {
          if (window.GG && GG.Toast) GG.Toast.info('Full archive coming soon!');
          else alert('Full archive coming soon!');
        }
      });
    }
  });

  // Fantasy notify button
  const notifyBtn = document.querySelector('.notify-form .btn-primary');
  const notifyInput = document.querySelector('.notify-input');
  if (notifyBtn && notifyInput) {
    notifyBtn.addEventListener('click', function() {
      const email = notifyInput.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (window.GG && GG.Toast) GG.Toast.error('Please enter a valid email address.');
        else alert('Please enter a valid email address.');
        return;
      }
      notifyInput.value = '';
      if (window.GG && GG.Toast) GG.Toast.success('You\'ll be notified when Fantasy Esports launches!');
      else alert('You\'ll be notified when Fantasy Esports launches!');
      notifyBtn.textContent = 'Subscribed!';
      notifyBtn.disabled = true;
      notifyBtn.style.opacity = '0.6';
    });
  }

  // VOD card play buttons
  document.querySelectorAll('.vod-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function() {
      const title = this.querySelector('.vod-title');
      if (window.GG && GG.Toast) GG.Toast.info('Playing: ' + (title ? title.textContent : 'VOD'));
      else alert('Playing: ' + (title ? title.textContent : 'VOD'));
    });
  });

  // News item clicks
  document.querySelectorAll('.news-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', function() {
      window.location.href = 'news.html';
    });
  });
})();
