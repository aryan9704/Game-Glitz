/* ═══════════════════════════════════════════════
       PROFILE PAGE — DYNAMIC RENDER
       ═══════════════════════════════════════════════ */

    const main = document.querySelector('#main-content');

    function formatTime(ms) {
      if (!ms) return 'Never';
      const timestamp = typeof ms === 'string' ? new Date(ms).getTime() : ms;
      const diff = Date.now() - timestamp;
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (mins < 2) return 'Just now';
      if (hrs < 1) return `${mins}m ago`;
      if (days < 1) return `${hrs}h ago`;
      if (days < 30) return `${days}d ago`;
      return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatPlayTime(mins) {
      if (!mins) return '0h played';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h === 0) return `${m}m played`;
      if (m === 0) return `${h}h played`;
      return `${h}h ${m}m`;
    }

    function totalHours(library) {
      const total = library.reduce((sum, g) => sum + (g.play_time || 0), 0);
      return Math.round(total / 60);
    }

    function getAchievements(library) {
      // Demo calculation — in a real app this would come from achievement data
      return library.reduce((sum, g) => sum + Math.floor((g.play_time || 0) / 30), 0);
    }

    function getInitials(name) {
      return (name || 'G').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    function getJoinDate(iso) {
      if (!iso) return 'Unknown';
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }

    /* ── Signed-Out State ── */
    function renderSignedOut() {
      main.innerHTML = `
        <section class="profile-signed-out" aria-label="Sign in required">
          <div class="signin-prompt" data-reveal data-morph-blob>
            <div class="signin-prompt__icon">👤</div>
            <p class="ggs-d95521b61b">Sign In to View Your <span class="gradient-text">Profile</span></p>
            <p>Your profile shows your stats, library, achievements, and activity feed. Sign in to access your public player card.</p>
            <div class="btn-group">
              <a href="account.html" class="btn btn-primary btn-lg" data-magnetic>Sign In</a>
              <a href="account.html#register" class="btn btn-secondary btn-lg" data-magnetic>Create Account</a>
            </div>
          </div>
        </section>`;
      initReveal();
    }

    /* ── Signed-In State ── */
    function renderProfile(user) {
      const library = GG.Library.items;
      const wishlist = GG.Wishlist.items;
      const orders = GG.Orders.items;
      const db = window.GAME_DATABASE || [];

      const gamesOwned = library.length;
      const hoursPlayed = totalHours(library);
      const achievements = getAchievements(library);
      const xpNeeded = user.level * 100;
      const xpPct = Math.min(100, Math.round((user.xp / xpNeeded) * 100));

      // Recently played — sorted by last_played, fallback to acquired_at
      const recentGames = [...library]
        .filter(g => g.last_played || g.acquired_at)
        .sort((a, b) => new Date(b.last_played || b.acquired_at) - new Date(a.last_played || a.acquired_at))
        .slice(0, 5);

      // Match library items against game database for full data
      function dbGame(id) {
        return db.find(g => g.id === id) || null;
      }

      // Showcase: first 6 owned games that have images
      const showcaseGames = library.slice(0, 6);

      // Activity feed (synthesized from orders + library)
      const activities = [];
      orders.slice(0, 3).forEach(order => {
        order.items.forEach(item => {
          activities.push({
            type: 'purchase',
            icon: '🛒',
            text: `Purchased <strong>${item.title}</strong>`,
            time: new Date(order.created_at).getTime()
          });
        });
      });
      wishlist.slice(0, 2).forEach(item => {
        activities.push({
          type: 'wishlist',
          icon: '❤️',
          text: `Added <strong>${item.title}</strong> to wishlist`,
          time: item.added_at ? new Date(item.added_at).getTime() : Date.now()
        });
      });
      if (user.level > 1) {
        activities.push({
          type: 'level',
          icon: '⭐',
          text: `Reached <strong>Level ${user.level}</strong>`,
          time: Date.now() - 86400000
        });
      }
      activities.sort((a, b) => b.time - a.time);
      const feedItems = activities.slice(0, 8);

      main.innerHTML = `
        <!-- Profile Header Cover -->
        <div class="profile-cover" aria-hidden="true"></div>

        <!-- Profile Card -->
        <div class="profile-container">
          <div class="profile-card glass-card" data-reveal data-tilt="4" data-glow>
            <div class="profile-avatar-wrap">
              <div class="profile-avatar">
                <div class="profile-avatar__inner">
                  ${user.avatar_url
                    ? `<img src="${user.avatar_url}" alt="${user.display_name || user.username} avatar" loading="lazy" decoding="async">`
                    : getInitials(user.display_name || user.username)
                  }
                </div>
              </div>
              <span class="profile-level-badge" aria-label="Level ${user.level}">LVL ${user.level}</span>
            </div>

            <div class="profile-info">
              <p class="profile-display-name ggs-6aa7db817a">${user.display_name || user.username}</p>
              <div class="profile-username">@${user.username}</div>
              <div class="profile-badges">
                ${(user.badges || ['New Gamer']).map(b =>
                  `<span class="profile-badge-pill">🏆 ${b}</span>`
                ).join('')}
                <span class="profile-badge-pill ggs-eee8d2fff2">
                  📅 Joined ${getJoinDate(user.created_at)}
                </span>
              </div>
            </div>

            <div class="profile-card-actions">
              <a href="account.html" class="btn btn-primary" data-magnetic>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Profile
              </a>
              <button type="button" class="btn btn-secondary" data-csp-onclick="copyProfileLink()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share Profile
              </button>
            </div>
          </div>
        </div>

        <!-- XP Bar -->
        <div class="xp-bar-section" data-reveal>
          <div class="xp-bar-wrap">
            <div class="xp-bar-labels">
              <strong>${user.xp} / ${xpNeeded} XP</strong>
              Level ${user.level} → ${user.level + 1}
            </div>
            <div class="xp-bar-track" role="progressbar" aria-valuenow="${user.xp}" aria-valuemin="0" aria-valuemax="${xpNeeded}" aria-label="XP progress">
              <div class="xp-bar-fill ggs-d2fba0f353" id="xp-fill"></div>
            </div>
            <div class="ggs-0255ac361f">
              ${xpPct}% to next
            </div>
          </div>
        </div>

        <!-- Stats -->
        <section class="stats-section" aria-label="Player statistics" data-reveal>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card__icon">🎮</div>
              <div class="stat-card__value" id="stat-games">${gamesOwned}</div>
              <div class="stat-card__label">Games Owned</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__icon">⏱️</div>
              <div class="stat-card__value" id="stat-hours">${hoursPlayed}h</div>
              <div class="stat-card__label">Hours Played</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__icon">🏆</div>
              <div class="stat-card__value" id="stat-ach">${achievements}</div>
              <div class="stat-card__label">Achievements</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__icon">❤️</div>
              <div class="stat-card__value">${wishlist.length}</div>
              <div class="stat-card__label">Wishlist</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__icon">📦</div>
              <div class="stat-card__value">${orders.length}</div>
              <div class="stat-card__label">Orders</div>
            </div>
          </div>
        </section>

        <!-- Main content -->
        <div class="profile-content">

          <!-- LEFT column -->
          <div class="profile-left" data-reveal>

            <!-- Recently Played -->
            <div class="profile-section-card">
              <div class="psc-header">
                <h2><span>🕹️</span> Recently Played</h2>
                <a href="account.html#library">View Library</a>
              </div>
              <div class="psc-body" id="recently-played-body">
                ${recentGames.length === 0
                  ? `<div class="empty-state">
                      <p>No games played yet — head to the <a class="ggs-f173677dd7" href="store.html">store</a> to find your next adventure.</p>
                     </div>`
                  : recentGames.map(g => {
                      const full = dbGame(g.game_id);
                      const img = full?.image || g.image || '';
                      const time = g.last_played || g.acquired_at;
                      return `
                        <div class="recent-game">
                          ${img
                            ? `<img src="${img}" alt="${g.title}" loading="lazy" decoding="async" data-csp-onerror="this.style.display='none'">`
                            : `<div class="ggs-17913298e7"></div>`
                          }
                          <div class="recent-game__info">
                            <div class="recent-game__title">${g.title}</div>
                            <div class="recent-game__meta">${formatPlayTime(g.play_time)}</div>
                          </div>
                          <span class="recent-game__time">${formatTime(time)}</span>
                        </div>`;
                    }).join('')
                }
              </div>
            </div>

            <!-- Activity Feed -->
            <div class="profile-section-card">
              <div class="psc-header">
                <h2><span>📋</span> Activity Feed</h2>
              </div>
              <div class="psc-body">
                ${feedItems.length === 0
                  ? `<div class="empty-state"><p>No activity yet. Start shopping, wishlisting, and playing!</p></div>`
                  : feedItems.map(item => {
                      const cls = {
                        purchase: 'purchase', wishlist: 'wishlist',
                        achievement: 'achievement', level: 'level'
                      }[item.type] || 'purchase';
                      return `
                        <div class="activity-item">
                          <div class="activity-icon activity-icon--${cls}" aria-hidden="true">${item.icon}</div>
                          <div class="activity-info">
                            <p>${item.text}</p>
                            <span class="activity-time">${formatTime(item.time)}</span>
                          </div>
                        </div>`;
                    }).join('')
                }
              </div>
            </div>

          </div>

          <!-- RIGHT column -->
          <div class="profile-right" data-reveal>

            <!-- Game Showcase -->
            <div class="profile-section-card">
              <div class="psc-header">
                <h2><span>⭐</span> Game Showcase</h2>
                <button type="button" data-csp-onclick="GG.Toast.info('Showcase editor — select your 6 favorite games to feature!')">Customize</button>
              </div>
              <div class="psc-body">
                ${showcaseGames.length === 0
                  ? `<div class="empty-state ggs-a021e40086">
                      <p>No games in your library yet.</p>
                      <a href="store.html" class="btn btn-primary btn-sm">Browse Store</a>
                    </div>`
                  : `<div class="showcase-grid">
                      ${Array.from({length: 6}, (_, i) => {
                        const g = showcaseGames[i];
                        const full = g ? dbGame(g.game_id) : null;
                        const img = full?.image || g?.image;
                        if (g && img) {
                          return `
                            <div class="showcase-slot" tabindex="0" role="button" aria-label="${g.title}" data-csp-onclick="GG.Toast.info('Showcasing: ${g.title}')">
                              <img src="${img}" alt="${g.title}" loading="lazy" decoding="async" data-csp-onerror="this.style.display='none'">
                              <div class="showcase-slot__overlay"><span>View</span></div>
                            </div>`;
                        }
                        return `
                          <div class="showcase-slot" tabindex="0" role="button" aria-label="Add game to showcase" data-csp-onclick="GG.Toast.info('Click Customize to select games for your showcase!')">
                            <span class="ggs-a4603f3ac3">+</span>
                          </div>`;
                      }).join('')}
                    </div>`
                }
              </div>
            </div>

            <!-- Account Links -->
            <div class="profile-section-card">
              <div class="psc-header">
                <h2><span>⚙️</span> Quick Links</h2>
              </div>
              <div class="psc-body ggs-51dd33a135">
                <a href="account.html" class="btn btn-secondary ggs-f8edc0438d">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  Account Settings
                </a>
                <a href="account.html#orders" class="btn btn-secondary ggs-f8edc0438d">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                  Order History
                </a>
                <a href="account.html#library" class="btn btn-secondary ggs-f8edc0438d">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  My Library
                </a>
                <a href="account.html#wishlist" class="btn btn-secondary ggs-f8edc0438d">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Wishlist
                </a>
                <button type="button" class="btn btn-ghost ggs-fba64645ab" data-csp-onclick="handleSignOut()">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </button>
              </div>
            </div>

          </div>
        </div>`;

      // Animate XP bar
      requestAnimationFrame(() => {
        setTimeout(() => {
          const fill = document.getElementById('xp-fill');
          if (fill) fill.style.width = xpPct + '%';
        }, 400);
      });

      initReveal();
    }

    function handleSignOut() {
      GG.Auth.logout();
      GG.Toast.info('Signed out successfully.');
      setTimeout(() => renderSignedOut(), 300);
    }

    function copyProfileLink() {
      const url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          GG.Toast.success('Profile link copied to clipboard!');
        });
      } else {
        GG.Toast.info('Profile: ' + url);
      }
    }

    function initReveal() {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.05 });

      document.querySelectorAll('[data-reveal]').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(28px)';
        el.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)';
        io.observe(el);
      });
    }

    /* ── Init ── */
    function init() {
      if (GG.Auth.isLoggedIn) {
        renderProfile(GG.Auth.currentUser);
      } else {
        renderSignedOut();
      }
    }

    // Re-render if auth state changes (e.g. login from another tab/nav)
    GG.on('auth:login', () => renderProfile(GG.Auth.currentUser));
    GG.on('auth:logout', () => renderSignedOut());
    GG.on('library:update', () => {
      if (GG.Auth.isLoggedIn) renderProfile(GG.Auth.currentUser);
    });

    document.addEventListener('DOMContentLoaded', init);
