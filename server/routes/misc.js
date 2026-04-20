/**
 * Miscellaneous routes: wishlist, library, orders, reviews,
 * friends, notifications, users, stats, support.
 */
const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function effectivePrice(game) {
  if (!game) return 0;
  return (game.sale_price !== null && game.sale_price !== undefined) ? Number(game.sale_price) : Number(game.price || 0);
}

module.exports = function createMiscRouter({ db, requireAuth, optionalAuth, requireVerifiedUser, auditLog, getDbStatus, sqlServer, dbConfig }) {
  // ── Wishlist ───────────────────────────────────────────
  router.get('/wishlist', requireAuth, async (req, res) => {
    const items = await db.prepare('SELECT w.added_at, g.* FROM wishlist_items w JOIN games g ON w.game_id = g.id WHERE w.user_id = ? ORDER BY w.added_at DESC').all(req.user.id);
    res.json({ items, count: items.length });
  });

  router.post('/wishlist/toggle', requireAuth, async (req, res) => {
    try {
      const game_id = parseInt(req.body?.game_id);
      if (!game_id || isNaN(game_id) || game_id < 1) return res.status(400).json({ error: 'game_id must be a positive integer.' });
      const gameExists = await db.prepare('SELECT id FROM games WHERE id = ?').get(game_id);
      if (!gameExists) return res.status(404).json({ error: 'Game not found.' });
      const existing = await db.prepare('SELECT id FROM wishlist_items WHERE user_id = ? AND game_id = ?').get(req.user.id, game_id);
      if (existing) {
        await db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(existing.id);
        res.json({ added: false });
      } else {
        await db.prepare('INSERT INTO wishlist_items (user_id, game_id) VALUES (?, ?)').run(req.user.id, game_id);
        await db.prepare('UPDATE users SET xp = xp + 5 WHERE id = ?').run(req.user.id);
        res.json({ added: true });
      }
    } catch (err) { console.error('Wishlist error:', err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Library ────────────────────────────────────────────
  router.get('/library', requireAuth, async (req, res) => {
    const items = await db.prepare('SELECT l.*, g.title, g.slug, g.image, g.genre, g.platform, g.rating, g.price, g.sale_price FROM library l JOIN games g ON l.game_id = g.id WHERE l.user_id = ? ORDER BY l.acquired_at DESC').all(req.user.id);
    res.json({ items, count: items.length });
  });

  router.patch('/library/:gameId', requireAuth, async (req, res) => {
    try {
      const entry = await db.prepare('SELECT id FROM library WHERE user_id = ? AND game_id = ?').get(req.user.id, req.params.gameId);
      if (!entry) return res.status(404).json({ error: 'Game not in library.' });
      const { installed, play_time } = req.body;
      if (installed !== undefined)
        await db.prepare("UPDATE library SET installed = ?, last_played = datetime('now') WHERE user_id = ? AND game_id = ?").run(installed ? 1 : 0, req.user.id, req.params.gameId);
      if (play_time !== undefined) {
        const mins = parseInt(play_time);
        if (isNaN(mins) || mins < 0 || mins > 1440) return res.status(400).json({ error: 'play_time must be 0–1440.' });
        await db.prepare("UPDATE library SET play_time = play_time + ?, last_played = datetime('now') WHERE user_id = ? AND game_id = ?").run(mins, req.user.id, req.params.gameId);
      }
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Orders ─────────────────────────────────────────────
  router.get('/orders', requireAuth, async (req, res) => {
    try {
      const orders = await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
      if (!orders.length) return res.json({ orders: [] });
      const placeholders = orders.map(() => '?').join(',');
      const orderIds = orders.map(o => o.id);
      const allItems = await db.prepare(`SELECT oi.order_id, oi.price_paid, g.title, g.image, g.slug FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id IN (${placeholders})`).all(...orderIds);
      const itemsByOrder = new Map();
      for (const item of allItems) {
        if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
        itemsByOrder.get(item.order_id).push({ price_paid: item.price_paid, title: item.title, image: item.image, slug: item.slug });
      }
      const result = orders.map(o => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
      res.json({ orders: result });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Reviews ────────────────────────────────────────────
  router.post('/reviews', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const game_id = parseInt(req.body?.game_id);
      const reviewTitle = String(req.body?.title || '').trim();
      const reviewBody = String(req.body?.body || '').trim();
      const rating = parseFloat(req.body?.rating);
      if (!game_id || isNaN(game_id) || game_id < 1) return res.status(400).json({ error: 'game_id must be a positive integer.' });
      if (isNaN(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5.' });
      const owned = await db.prepare('SELECT 1 as v FROM library WHERE user_id = ? AND game_id = ?').get(req.user.id, game_id);
      if (!owned) return res.status(403).json({ error: 'You must own this game to review it.' });
      await db.prepare('INSERT INTO reviews (user_id, game_id, rating, title, body) VALUES (?, ?, ?, ?, ?)').run(req.user.id, game_id, rating, reviewTitle.slice(0, 200), reviewBody.slice(0, 2000));
      const avg = await db.prepare('SELECT AVG(CAST(rating AS FLOAT)) as avg, COUNT(*) as count FROM reviews WHERE game_id = ?').get(game_id);
      const avgValue = avg && avg.count > 0 && avg.avg !== null ? Math.round(Number(avg.avg) * 10) / 10 : null;
      await db.prepare('UPDATE games SET rating = ?, reviews = ? WHERE id = ?').run(avgValue, avg.count, game_id);
      await db.prepare('UPDATE users SET xp = xp + 25 WHERE id = ?').run(req.user.id);
      res.status(201).json({ success: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627') || err.message?.includes('2601')) return res.status(409).json({ error: 'You have already reviewed this game.' });
      console.error('Review error:', err); res.status(500).json({ error: 'Failed to submit review.' });
    }
  });

  router.get('/reviews/:gameId', async (req, res) => {
    try {
      const reviews = await db.prepare('SELECT r.*, u.username, u.display_name, u.avatar_url FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.game_id = ? ORDER BY r.created_at DESC').all(req.params.gameId);
      res.json({ reviews });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Friends ────────────────────────────────────────────
  router.get('/friends', requireAuth, async (req, res) => {
    try {
      const uid = req.user.id;
      const friends = await db.prepare(`SELECT f.status, f.created_at, CASE WHEN f.user_id = ? THEN fu.id ELSE u.id END as friend_id, CASE WHEN f.user_id = ? THEN fu.username ELSE u.username END as username, CASE WHEN f.user_id = ? THEN fu.display_name ELSE u.display_name END as display_name, CASE WHEN f.user_id = ? THEN fu.avatar_url ELSE u.avatar_url END as avatar_url, CASE WHEN f.user_id = ? THEN fu.level ELSE u.level END as level FROM friends f JOIN users u ON f.user_id = u.id JOIN users fu ON f.friend_id = fu.id WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'`).all(uid, uid, uid, uid, uid, uid, uid);
      const pending = await db.prepare("SELECT f.id, f.created_at, u.id as from_id, u.username, u.display_name, u.avatar_url FROM friends f JOIN users u ON f.user_id = u.id WHERE f.friend_id = ? AND f.status = ?").all(uid, 'pending');
      res.json({ friends, pending_requests: pending });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/friends/request', requireAuth, async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'Username is required.' });
      if (username.length > 30) return res.status(400).json({ error: 'Username too long.' });
      const target = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (!target) return res.status(404).json({ error: 'User not found.' });
      if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself.' });
      const existing = await db.prepare('SELECT user_id, friend_id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').all(req.user.id, target.id, target.id, req.user.id);
      if (existing.some(r => r.status === 'accepted')) return res.status(409).json({ error: 'You are already friends.' });
      if (existing.some(r => r.user_id === req.user.id && r.friend_id === target.id)) return res.status(409).json({ error: 'Friend request already sent.' });
      if (existing.some(r => r.user_id === target.id && r.friend_id === req.user.id && r.status === 'pending')) return res.status(409).json({ error: 'This user already sent you a friend request.' });
      await db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)').run(req.user.id, target.id, 'pending');
      await db.prepare('INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)').run(uuid(), target.id, 'friend_request', 'Friend Request', `${req.user.username} wants to be your friend.`);
      res.json({ success: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627')) return res.status(409).json({ error: 'Friend request already sent.' });
      console.error(err); res.status(500).json({ error: 'Failed.' });
    }
  });

  router.post('/friends/accept', requireAuth, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id || typeof user_id !== 'string' || !UUID_RE.test(user_id)) return res.status(400).json({ error: 'Valid user_id is required.' });
    const r = await db.prepare("UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ? AND status = ?").run('accepted', user_id, req.user.id, 'pending');
    if (r.changes === 0) return res.status(400).json({ error: 'No pending request.' });
    res.json({ success: true });
  });

  // ── Notifications ──────────────────────────────────────
  router.get('/notifications', requireAuth, async (req, res) => {
    const items = await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    const ur = await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND "read" = 0').get(req.user.id);
    res.json({ notifications: items, unread: ur.count });
  });

  router.post('/notifications/read', requireAuth, async (req, res) => {
    const { ids } = req.body;
    if (ids === 'all') {
      await db.prepare('UPDATE notifications SET "read" = 1 WHERE user_id = ?').run(req.user.id);
    } else if (Array.isArray(ids)) {
      if (ids.length > 100) return res.status(400).json({ error: 'Too many notification IDs (max 100).' });
      for (const id of ids) {
        if (typeof id !== 'string' || id.length > 50) continue;
        await db.prepare('UPDATE notifications SET "read" = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);
      }
    } else {
      return res.status(400).json({ error: 'ids must be an array of notification IDs or "all".' });
    }
    res.json({ success: true });
  });

  // ── Public Profiles ────────────────────────────────────
  router.get('/users/:username', async (req, res) => {
    try {
      const user = await db.prepare('SELECT id, username, display_name, avatar_url, bio, level, xp, created_at FROM users WHERE username = ?').get(req.params.username.toLowerCase());
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const library = await db.prepare('SELECT g.title, g.image, g.slug, l.play_time FROM library l JOIN games g ON l.game_id = g.id WHERE l.user_id = ? ORDER BY l.play_time DESC LIMIT 20').all(user.id);
      const groups = await db.prepare('SELECT g.name, g.slug, g.member_count FROM group_members gm JOIN groups g ON gm.group_id = g.id WHERE gm.user_id = ? LIMIT 10').all(user.id);
      res.json({ user, library, groups });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Stats ──────────────────────────────────────────────
  router.get('/stats', async (req, res) => {
    try {
      const g = await db.prepare('SELECT COUNT(*) as c FROM games').get();
      const u = await db.prepare('SELECT COUNT(*) as c FROM users').get();
      const o = await db.prepare('SELECT COUNT(*) as c FROM orders').get();
      const gr = await db.prepare('SELECT COUNT(*) as c FROM groups').get();
      res.json({ games: g.c, users: u.c, orders: o.c, groups: gr.c });
    } catch { res.json({ games: 100, users: 0, orders: 0, groups: 0 }); }
  });

  // ── Health ─────────────────────────────────────────────
  router.get('/health', async (req, res) => {
    try {
      await db.prepare('SELECT 1 as ok').get();
      const status = getDbStatus();
      res.json({ status: 'ok', db: status.mode, primary: status.primary, mirror: status.mirror ? { target: status.secondary, status: status.mirror.status, last_sync_at: status.mirror.lastSyncAt, last_error: status.mirror.lastError } : null, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
    } catch (err) { res.status(503).json({ status: 'degraded', error: 'Database unavailable.' }); }
  });

  // ── Support ────────────────────────────────────────────
  router.post('/support', optionalAuth, async (req, res) => {
    try {
      const name    = String(req.body?.name    || '').trim();
      const email   = String(req.body?.email   || '').trim().toLowerCase();
      const category= String(req.body?.category|| '').trim();
      const subject = String(req.body?.subject || '').trim();
      const message = String(req.body?.message || '').trim();
      if (!name || !email || !category || !subject || !message) return res.status(400).json({ error: 'All fields are required.' });
      if (name.length < 2)    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
      if (name.length > 100)  return res.status(400).json({ error: 'Name must be 100 characters or fewer.' });
      if (subject.length < 3) return res.status(400).json({ error: 'Subject must be at least 3 characters.' });
      const VALID_CATEGORIES = [
        'Bug', 'Billing', 'Account', 'Technical', 'Feedback', 'Other',
        'Account & Security', 'Purchases & Billing', 'Refund Request',
        'Technical Issue / Bug', 'Community Report / Appeal',
        'Subscription & Plans', 'Feature Request',
      ];
      if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
      if (subject.length > 200) return res.status(400).json({ error: 'Subject too long.' });
      if (message.length < 10)  return res.status(400).json({ error: 'Message must be at least 10 characters.' });
      if (message.length > 5000) return res.status(400).json({ error: 'Message too long.' });
      const ticketId = 'TKT-' + Date.now().toString(36).toUpperCase();
      const userId = req.user ? req.user.id : null;
      await db.prepare('INSERT INTO support_tickets (id, user_id, email, category, subject, message) VALUES (?, ?, ?, ?, ?, ?)').run(ticketId, userId, email.toLowerCase(), category, subject, message);
      if (userId) await db.prepare('INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)').run(uuid(), userId, 'support', `Support ticket ${ticketId}`, `Category: ${category} — ${subject}`);
      await auditLog('support_ticket', { userId, target: `ticket:${ticketId}`, meta: { category, email }, ip: req.ip });
      res.json({ success: true, ticket_id: ticketId, message: 'Your request has been received.' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/support/chat', optionalAuth, async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Message is required.' });
      if (message.length > 1200) return res.status(400).json({ error: 'Message is too long.' });
      const lower = message.toLowerCase();
      let reply = 'Thanks for your message. A support specialist will follow up shortly. You can also submit a ticket below for faster tracking.';
      if (/refund|charge|billing|payment/.test(lower)) reply = 'For billing or refund issues, please include your order ID in the support form below. We usually respond within 2 hours.';
      else if (/account|login|password|2fa|two-factor/.test(lower)) reply = 'For account access problems, we can help quickly. Please include your username and what error you are seeing.';
      else if (/download|install|crash|bug|error/.test(lower)) reply = 'For technical issues, please share your game title, platform, and exact error message so we can reproduce it.';
      await auditLog('support_chat', { userId: req.user?.id || null, target: 'chat_session', meta: { messagePreview: message.slice(0, 120) }, ip: req.ip });
      res.json({ ok: true, reply });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── User Support Tickets (view own tickets) ────────────
  router.get('/support/tickets', requireAuth, async (req, res) => {
    try {
      const tickets = await db.prepare('SELECT id, category, subject, message, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
      res.json({ tickets });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch tickets.' }); }
  });

  return router;
};
