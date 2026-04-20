(function() {
  'use strict';
  const gradients = [
    'linear-gradient(135deg,#8B5CF6,#6366F1)',
    'linear-gradient(135deg,#06B6D4,#6366F1)',
    'linear-gradient(135deg,#F43F5E,#F59E0B)',
    'linear-gradient(135deg,#10B981,#06B6D4)',
    'linear-gradient(135deg,#C084FC,#8B5CF6)',
  ];
  const emojis = ['🏆','🎨','🎙️','🌍','⚔️','🎮','🔥','💎'];

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderGroupCard(group, idx) {
    const grad = gradients[idx % gradients.length];
    const emoji = emojis[idx % emojis.length];
    const name = esc(group.name || '?');
    const desc = esc(group.description || 'A community group.');
    const owner = esc(group.owner_username || '—');
    return `
      <div class="glass-card group-card" data-tilt="6" data-group-id="${esc(group.id)}">
        <div class="group-banner" data-group-gradient="${grad}">
          ${emoji}
          <div class="group-avatar" data-group-gradient="${grad}">${name[0].toUpperCase()}</div>
        </div>
        <div class="group-info">
          <div class="group-name">${name}</div>
          <div class="group-desc">${desc}</div>
          <div class="group-stats">
            <div><div class="group-stat-val">${group.member_count || 1}</div><div class="group-stat-lbl">Members</div></div>
            <div><div class="group-stat-val">${owner}</div><div class="group-stat-lbl">Owner</div></div>
            <button type="button" class="badge-active ggs-81a434acd9" data-csp-onclick="joinGroup('${esc(group.id)}')">Join</button>
          </div>
        </div>
      </div>`;
  }

  async function loadGroups() {
    const grid = document.getElementById('groupsGrid');
    try {
      const data = await GG.Community.getGroups({ limit: 12 });
      const groups = data.groups || [];
      if (groups.length === 0) {
        grid.innerHTML = '<div class="ggs-1e00fb046e">No groups yet. Be the first to create one!</div>';
      } else {
        grid.innerHTML = groups.map((g, i) => renderGroupCard(g, i)).join('');
        grid.querySelectorAll('[data-group-gradient]').forEach((el) => {
          el.style.background = el.dataset.groupGradient;
        });
      }
    } catch {
      grid.innerHTML = '<div class="ggs-1e00fb046e">Could not load groups.</div>';
    }
  }

  window.showCreateGroupForm = function() {
    if (!GG.Auth.isLoggedIn) { GG.Toast.warning('Sign in to create a group.'); return; }
    document.getElementById('createGroupForm').style.display = 'block';
    document.getElementById('newGroupName').focus();
  };

  window.createGroup = async function() {
    const name = document.getElementById('newGroupName').value.trim();
    const desc = document.getElementById('newGroupDesc').value.trim();
    if (!name) { GG.Toast.error('Group name is required.'); return; }
    try {
      await GG.Community.createGroup({ name, description: desc });
      GG.Toast.success('Group created!');
      document.getElementById('createGroupForm').style.display = 'none';
      document.getElementById('newGroupName').value = '';
      document.getElementById('newGroupDesc').value = '';
      loadGroups();
    } catch (err) {
      GG.Toast.error(err.error || 'Failed to create group.');
    }
  };

  window.joinGroup = async function(id) {
    if (!GG.Auth.isLoggedIn) { GG.Toast.warning('Sign in to join groups.'); return; }
    try {
      await GG.Community.joinGroup(id);
      GG.Toast.success('Joined group!');
      loadGroups();
    } catch (err) {
      GG.Toast.error(err.error || 'Could not join.');
    }
  };

  // LFG Modal
  window.showPostLFGForm = function() {
    if (!GG.Auth.isLoggedIn) { GG.Toast.warning('Sign in to post an LFG listing.'); return; }
    const modal = document.getElementById('lfgModal');
    if (modal) { modal.style.display = 'flex'; document.getElementById('lfgGame').focus(); }
  };
  window.hideLFGModal = function() {
    const modal = document.getElementById('lfgModal');
    if (modal) modal.style.display = 'none';
  };
  window.submitLFG = function() {
    const game = document.getElementById('lfgGame').value;
    const rank = document.getElementById('lfgRank').value.trim();
    const desc = document.getElementById('lfgDesc').value.trim();
    if (!game) { GG.Toast.error('Please select a game.'); return; }
    if (!desc) { GG.Toast.error('Please describe what you\'re looking for.'); return; }
    // Post as a community post with LFG tag
    GG.Community.createPost({ title: `[LFG] ${game}${rank ? ' — ' + rank : ''}`, body: desc })
      .then(() => {
        GG.Toast.success('LFG post created!');
        hideLFGModal();
        document.getElementById('lfgGame').value = '';
        document.getElementById('lfgRank').value = '';
        document.getElementById('lfgDesc').value = '';
      })
      .catch(err => GG.Toast.error(err.error || 'Failed to post LFG.'));
  };
  // Close LFG modal on backdrop click
  document.getElementById('lfgModal')?.addEventListener('click', function(e) {
    if (e.target === this) hideLFGModal();
  });

  // FAB — create post
  const fab = document.querySelector('.fab');
  if (fab) {
    fab.onclick = function() {
      if (!GG.Auth.isLoggedIn) { GG.Toast.warning('Sign in to create posts.'); return; }
      const title = prompt('Post title:');
      if (!title) return;
      const body = prompt('Post body:');
      if (!body) return;
      GG.Community.createPost({ title, body }).then(() => {
        GG.Toast.success('Post created!');
      }).catch(err => GG.Toast.error(err.error || 'Failed.'));
    };
  }

  // Init
  function init() {
    if (typeof GG === 'undefined' || !GG.Community) { setTimeout(init, 50); return; }
    loadGroups();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
