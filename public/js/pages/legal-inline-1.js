(function() {
  // Tab definitions with TOC contents
  const docTOC = {
    tos: [
      { id: 'tos-1', label: '1. Acceptance of Terms' },
      { id: 'tos-2', label: '2. Eligibility' },
      { id: 'tos-3', label: '3. Account Registration' },
      { id: 'tos-4', label: '4. Licenses & IP' },
      { id: 'tos-5', label: '5. Prohibited Conduct' },
      { id: 'tos-6', label: '6. Disclaimers & Liability' },
      { id: 'tos-7', label: '7. Dispute Resolution' },
    ],
    privacy: [
      { id: 'privacy-1', label: '1. Information We Collect' },
      { id: 'privacy-2', label: '2. How We Use It' },
      { id: 'privacy-3', label: '3. Data Sharing' },
      { id: 'privacy-4', label: '4. Your Rights (GDPR/CCPA)' },
      { id: 'privacy-5', label: '5. Retention & Security' },
    ],
    cookies: [
      { id: 'cookie-1', label: '1. What Are Cookies' },
      { id: 'cookie-2', label: '2. Types We Use' },
      { id: 'cookie-3', label: '3. Managing Preferences' },
    ],
    refund: [
      { id: 'refund-1', label: '1. Standard Eligibility' },
      { id: 'refund-2', label: '2. Exceptional Refunds' },
      { id: 'refund-3', label: '3. Non-Refundable Items' },
      { id: 'refund-4', label: '4. Process & Timelines' },
    ],
    eula: [
      { id: 'eula-1', label: '1. License Grant' },
      { id: 'eula-2', label: '2. License Restrictions' },
      { id: 'eula-3', label: '3. Updates & Support' },
    ],
    dmca: [
      { id: 'dmca-1', label: '1. Notice & Takedown' },
      { id: 'dmca-2', label: '2. Designated Agent' },
    ],
    community: [
      { id: 'cg-1', label: '1. Hateful Conduct' },
      { id: 'cg-2', label: '2. Harassment & Threats' },
      { id: 'cg-3', label: '3. Cheating & Integrity' },
      { id: 'cg-4', label: '4. Enforcement Actions' },
    ],
  };

  function buildTOC(tabId) {
    const toc = document.getElementById('tocList');
    const items = docTOC[tabId] || [];
    toc.innerHTML = items.map(item => `
      <li class="toc-item">
        <a href="#${item.id}" data-magnetic data-csp-onclick="scrollToSection('${item.id}')">${item.label}</a>
      </li>
    `).join('');
  }

  window.scrollToSection = function(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Mark active
    document.querySelectorAll('.toc-item a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.toc-item a[href="#${id}"]`);
    if (link) link.classList.add('active');
  };

  window.switchTab = function(tabId, btn) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show correct doc
    document.querySelectorAll('.legal-doc').forEach(doc => doc.classList.remove('active'));
    document.getElementById('doc-' + tabId).classList.add('active');
    // Build TOC
    buildTOC(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Init TOC for default tab
  buildTOC('tos');

  // Intersection observer for TOC highlighting
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        document.querySelectorAll('.toc-item a').forEach(a => a.classList.remove('active'));
        const link = document.querySelector(`.toc-item a[href="#${entry.target.id}"]`);
        if (link) link.classList.add('active');
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  document.querySelectorAll('.legal-section').forEach(sec => observer.observe(sec));

  // Download (simulated)
  window.downloadDoc = function(docName) {
    const el = document.createElement('a');
    el.href = '#';
    el.download = `gameglitz-${docName}-policy.pdf`;
    el.click();
  };
})();
