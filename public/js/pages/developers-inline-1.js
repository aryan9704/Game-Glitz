(function () {
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function wrapKineticTitles() {
    document.querySelectorAll('.kinetic-title').forEach(function (title) {
      if (title.dataset.kineticReady || title.querySelector('.k-word')) return;
      var words = title.textContent.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      title.textContent = '';
      words.forEach(function (word, index) {
        var span = document.createElement('span');
        span.className = 'k-word';
        span.style.setProperty('--word-index', index);
        span.textContent = word;
        title.appendChild(span);
        if (index < words.length - 1) {
          title.appendChild(document.createTextNode(' '));
        }
      });
      title.dataset.kineticReady = 'true';
    });
  }

  function initJourneyNav() {
    var links = Array.from(document.querySelectorAll('[data-journey-link]'));
    var summaryTitle = document.getElementById('journey-summary-title');
    var summaryCopy = document.getElementById('journey-summary-copy');
    var progress = document.getElementById('journey-progress-bar');
    var sections = links
      .map(function (link) {
        var target = document.getElementById(link.dataset.journeyLink);
        if (!target) return null;
        return {
          link: link,
          target: target,
          id: link.dataset.journeyLink,
          name: target.dataset.sectionName || link.textContent.trim(),
          copy: target.dataset.sectionCopy || ''
        };
      })
      .filter(Boolean);

    if (!sections.length) return;

    function setActive(activeId) {
      var activeIndex = 0;
      sections.forEach(function (item, index) {
        var isActive = item.id === activeId;
        item.link.classList.toggle('is-active', isActive);
        item.link.setAttribute('aria-current', isActive ? 'true' : 'false');
        if (isActive) {
          activeIndex = index;
          if (summaryTitle) summaryTitle.textContent = item.name;
          if (summaryCopy) summaryCopy.textContent = item.copy;
        }
      });
      if (progress) {
        progress.style.width = ((activeIndex + 1) / sections.length) * 100 + '%';
      }
    }

    function updateFromScroll() {
      var anchor = Math.min(window.innerHeight * 0.34, 260);
      var active = sections[0];
      var best = Infinity;
      sections.forEach(function (item) {
        var rect = item.target.getBoundingClientRect();
        if (rect.bottom < 140) return;
        var distance = Math.abs(rect.top - anchor);
        if (distance < best) {
          best = distance;
          active = item;
        }
      });
      setActive(active.id);
    }

    var scrollTick = 0;
    function requestUpdate() {
      if (scrollTick) return;
      scrollTick = window.requestAnimationFrame(function () {
        scrollTick = 0;
        updateFromScroll();
      });
    }

    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        var target = document.getElementById(link.dataset.journeyLink);
        if (!target) return;
        event.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: top, behavior: reducedMotion ? 'auto' : 'smooth' });
      });
    });

    updateFromScroll();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
  }

  function initPersonaFilter() {
    var buttons = Array.from(document.querySelectorAll('.persona-card[data-persona-filter]'));
    var status = document.getElementById('persona-status');
    var targets = Array.from(document.querySelectorAll('[data-persona]'));
    var copy = {
      all: 'Full portal view is active. Choose a studio lane to spotlight the tools and plans that fit your team.',
      indie: 'Indie launch mode is active. The page is now prioritizing fast setup, beta feedback, and lean launch tools.',
      multiplayer: 'Multiplayer / live mode is active. Community, cadence, and live-ops systems are now carrying more emphasis.',
      enterprise: 'Enterprise ops mode is active. Revenue visibility, security, and partner-grade support are now highlighted.'
    };

    if (!buttons.length || !targets.length) return;

    function setPersona(filter) {
      buttons.forEach(function (button) {
        var isActive = button.dataset.personaFilter === filter;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      targets.forEach(function (target) {
        var personas = (target.dataset.persona || '').split(/\s+/).filter(Boolean);
        var match = filter === 'all' || personas.indexOf(filter) !== -1;
        target.classList.toggle('is-dim', !match);
      });

      if (status) {
        status.textContent = copy[filter] || copy.all;
      }
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        setPersona(button.dataset.personaFilter);
      });
    });

    setPersona('all');
  }

  function initDocsCommand() {
    var filters = Array.from(document.querySelectorAll('.doc-filter'));
    var cards = Array.from(document.querySelectorAll('.doc-card[data-doc-type]'));
    var previewTitle = document.getElementById('docs-preview-title');
    var previewCopy = document.getElementById('docs-preview-copy');
    var previewTag = document.getElementById('docs-preview-tag');
    var previewAudience = document.getElementById('docs-preview-audience');

    if (!cards.length) return;

    cards.forEach(function (card) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
    });

    function updatePreview(card) {
      cards.forEach(function (item) {
        item.classList.toggle('is-active', item === card);
      });
      if (previewTitle) previewTitle.textContent = card.dataset.docTitle || card.querySelector('.doc-name').textContent.trim();
      if (previewCopy) previewCopy.textContent = card.dataset.docCopy || '';
      if (previewTag) previewTag.textContent = card.dataset.docTag || '';
      if (previewAudience) previewAudience.textContent = card.dataset.docAudience || '';
    }

    function applyFilter(filter) {
      var firstVisible = null;
      filters.forEach(function (button) {
        var active = button.dataset.docFilter === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      cards.forEach(function (card) {
        var match = filter === 'all' || card.dataset.docType === filter;
        card.hidden = !match;
        if (match && !firstVisible) firstVisible = card;
      });
      updatePreview(firstVisible || cards[0]);
    }

    filters.forEach(function (button) {
      button.addEventListener('click', function () {
        applyFilter(button.dataset.docFilter);
      });
    });

    cards.forEach(function (card) {
      var activate = function () { updatePreview(card); };
      card.addEventListener('mouseenter', activate);
      card.addEventListener('focus', activate);
      card.addEventListener('click', activate);
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });

    applyFilter('all');
  }

  function initStoryline() {
    var beats = Array.from(document.querySelectorAll('.story-beat'));
    var label = document.getElementById('storyline-label');
    var copy = document.getElementById('storyline-copy');
    var meter = document.getElementById('storyline-meter-fill');

    if (!beats.length) return;

    function activateBeat(beat) {
      var index = beats.indexOf(beat);
      beats.forEach(function (item) {
        item.classList.toggle('is-active', item === beat);
      });
      if (label) label.textContent = beat.dataset.storyLabel || '';
      if (copy) copy.textContent = beat.dataset.storyCopy || '';
      if (meter) meter.style.width = ((index + 1) / beats.length) * 100 + '%';
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries
          .filter(function (entry) { return entry.isIntersecting; })
          .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
        if (visible) activateBeat(visible.target);
      }, { threshold: [0.4, 0.65, 0.9], rootMargin: '-10% 0px -18% 0px' });

      beats.forEach(function (beat) { observer.observe(beat); });
    }

    activateBeat(beats[0]);
  }

  function initTierSelection() {
    var cards = Array.from(document.querySelectorAll('.tier-card[data-tier-name]'));
    if (!cards.length) return;

    function selectCard(card) {
      cards.forEach(function (item) {
        item.classList.toggle('is-selected', item === card);
      });
    }

    cards.forEach(function (card) {
      card.addEventListener('mouseenter', function () { selectCard(card); });
      card.addEventListener('focusin', function () { selectCard(card); });
      card.addEventListener('click', function () { selectCard(card); });
    });

    selectCard(document.querySelector('.tier-card.featured') || cards[0]);
  }

  wrapKineticTitles();
  initJourneyNav();
  initPersonaFilter();
  initDocsCommand();
  initStoryline();
  initTierSelection();
})();
