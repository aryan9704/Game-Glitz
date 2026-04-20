// Upload area drag and drop
(function() {
  const area = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  if (area) {
    area.addEventListener('click', () => fileInput.click());
    area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', (e) => {
      e.preventDefault(); area.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      area.querySelector('.upload-text').innerHTML = `<strong>${files.length} file(s) selected</strong>`;
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) area.querySelector('.upload-text').innerHTML = `<strong>${e.target.files.length} file(s) selected</strong>`;
    });
  }

  // Form submit
  window.submitForm = async function(e) {
    e.preventDefault();
    const fname = document.getElementById('fname').value.trim();
    const lname = document.getElementById('lname').value.trim();
    const email = document.getElementById('email').value.trim();
    const category = document.getElementById('category').value;
    const subject = document.getElementById('subject').value.trim();
    const message = document.getElementById('message').value.trim();

    // Validate required fields
    function showError(msg) { if (window.GG && GG.Toast) GG.Toast.error(msg); else alert(msg); }
    if (!fname || !lname) {
      showError('Please enter your first and last name.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (!category) {
      showError('Please select a request category.');
      return;
    }
    if (!subject) {
      showError('Please enter a subject.');
      return;
    }
    if (message.length < 20) {
      showError('Please describe your issue in more detail (at least 20 characters).');
      return;
    }

    const btn = document.getElementById('formSubmitBtn');
    const text = document.getElementById('submitBtnText');
    text.textContent = 'Sending…';
    btn.disabled = true;

    try {
      const token = (window.GG && GG.Auth && GG.Auth.token) || localStorage.getItem('gg_token') || sessionStorage.getItem('gg_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch(window.GG.apiUrl('/support'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `${fname} ${lname}`.trim(),
          email,
          category,
          subject,
          message,
        }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        if (window.GG) GG.Toast.error(data.error || 'Submission failed. Please try again.');
        text.textContent = 'Send Support Request';
        btn.disabled = false;
        return;
      }

      if (window.GG) GG.Toast.success('✅ Support request submitted!');
      document.getElementById('supportForm').style.display = 'none';
      const successEl = document.getElementById('formSuccess');
      successEl.style.display = 'block';
      // Show the ticket ID so the user can reference it
      if (data.ticket_id) {
        const ticketNote = successEl.querySelector('p');
        if (ticketNote) ticketNote.innerHTML = `Your ticket <strong class="ggs-bcad52d1b8">${data.ticket_id}</strong> has been received. Our team will review it and get back to you.`;
      }
    } catch {
      if (window.GG) GG.Toast.error('Network error. Please check your connection and try again.');
      text.textContent = 'Send Support Request';
      btn.disabled = false;
    }
  };

  // Chat toggle
  window.toggleChat = function() {
    const panel = document.getElementById('chatPanel');
    panel.classList.toggle('open');
    document.querySelector('.chat-badge').style.display = 'none';
  };

  // Chat send
  window.sendChatMsg = async function() {
    const input = document.getElementById('chatInput');
    const msgs = document.getElementById('chatMessages');
    const sendBtn = document.getElementById('chatSendBtn');
    const text = input.value.trim();
    if (!text) return;

    // User message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg-user-wrap';
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-msg-user';
    userBubble.textContent = text; // textContent prevents XSS
    userMsg.appendChild(userBubble);
    msgs.appendChild(userMsg);
    input.value = '';
    if (sendBtn) sendBtn.disabled = true;
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const token = (window.GG && GG.Auth && GG.Auth.token) || localStorage.getItem('gg_token') || sessionStorage.getItem('gg_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(window.GG.apiUrl('/support/chat'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text }),
      });
      const data = await resp.json();

      const agentMsg = document.createElement('div');
      agentMsg.className = 'chat-msg';
      if (resp.ok && data && data.reply) {
        agentMsg.innerHTML = `<div class="chat-msg-agent">${data.reply}</div>`;
      } else {
        agentMsg.innerHTML = '<div class="chat-msg-agent">We received your message but could not start a live session. Please submit a support ticket below for guaranteed follow-up.</div>';
      }
      msgs.appendChild(agentMsg);
      msgs.scrollTop = msgs.scrollHeight;
    } catch (_) {
      const agentMsg = document.createElement('div');
      agentMsg.className = 'chat-msg';
      agentMsg.innerHTML = '<div class="chat-msg-agent">Network issue while reaching live chat. Please try again or submit a support ticket below.</div>';
      msgs.appendChild(agentMsg);
      msgs.scrollTop = msgs.scrollHeight;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  };

  // Status time
  const statusTime = document.getElementById('statusTime');
  if (statusTime) {
    const now = new Date();
    statusTime.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  }

  // Timezone clocks
  function updateClocks() {
    document.querySelectorAll('[data-tz]').forEach(el => {
      const tz = el.dataset.tz;
      el.textContent = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
    });
  }
  updateClocks();
  setInterval(updateClocks, 1000);
})();
