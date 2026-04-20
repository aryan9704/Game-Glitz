const express = require('express');
const crypto = require('crypto');
const router  = express.Router();

module.exports = function createAdminRouter({ db, requireAuth, auditLog, adminLimiter }) {
  // ── Admin auth guard ───────────────────────────────────
  function secretEquals(candidate, expected) {
    const a = Buffer.from(String(candidate || ''), 'utf8');
    const b = Buffer.from(String(expected || ''), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function requireAdmin(req, res, next) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return res.status(503).json({ error: 'Admin panel not configured (ADMIN_SECRET not set).' });
    const auth = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const header = req.headers['x-admin-secret'] || auth?.[1];
    if (!header || !secretEquals(header, secret)) return res.status(403).json({ error: 'Forbidden.' });
    next();
  }

  if (adminLimiter) router.use(adminLimiter);

  // Protect all routes under /admin
  router.use(requireAdmin);

  // ── Dashboard stats ────────────────────────────────────
  router.get('/stats', async (req, res) => {
    try {
      const [games, users, orders, tickets] = await Promise.all([
        db.prepare('SELECT COUNT(*) as c FROM games').get(),
        db.prepare('SELECT COUNT(*) as c FROM users').get(),
        db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total),0) as revenue FROM orders").get(),
        db.prepare('SELECT COUNT(*) as c FROM support_tickets').get(),
      ]);
      res.json({ games: games.c, users: users.c, orders: orders.c, revenue: orders.revenue, support_tickets: tickets.c });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Games CRUD ─────────────────────────────────────────
  router.get('/games', async (req, res) => {
    try {
      const { search, limit = 50, offset = 0 } = req.query;
      let q = 'SELECT id, title, slug, price, sale_price, genre, platform, rating, reviews, featured, trending, free_to_play FROM games WHERE 1=1';
      const p = [];
      if (search) { q += ' AND (title LIKE ? OR slug LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
      q += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      p.push(Math.min(200, parseInt(limit) || 50), Math.max(0, parseInt(offset) || 0));
      const total = (await db.prepare('SELECT COUNT(*) as c FROM games').get()).c;
      res.json({ games: await db.prepare(q).all(...p), total });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.get('/games/:id', async (req, res) => {
    try {
      const game = await db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      res.json({ game });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/games', async (req, res) => {
    try {
      const { title, slug, price, sale_price, image, genre, platform, description, developer, publisher, release_date, tags, size, featured, trending, free_to_play } = req.body;
      if (!title || !slug || price === undefined) return res.status(400).json({ error: 'title, slug, price required.' });
      if (String(title).trim().length < 1) return res.status(400).json({ error: 'title cannot be blank.' });
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: 'slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens).' });
      const parsedPrice = Number(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) return res.status(400).json({ error: 'price must be a non-negative number.' });
      if (sale_price !== undefined && sale_price !== null) {
        const parsedSale = Number(sale_price);
        if (isNaN(parsedSale) || parsedSale < 0) return res.status(400).json({ error: 'sale_price must be a non-negative number.' });
        if (parsedSale >= parsedPrice) return res.status(400).json({ error: 'sale_price must be less than price.' });
      }
      await db.prepare('INSERT INTO games (title, slug, price, sale_price, image, genre, platform, description, developer, publisher, release_date, tags, size, featured, trending, free_to_play) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        String(title).trim().slice(0, 200), slug.slice(0, 100), parsedPrice, sale_price != null ? Number(sale_price) : null,
        image || null, JSON.stringify(genre || []), JSON.stringify(platform || []), (description || '').slice(0, 5000),
        (developer || '').slice(0, 100), (publisher || '').slice(0, 100), release_date || null,
        JSON.stringify(tags || []), size || null, featured ? 1 : 0, trending ? 1 : 0, free_to_play ? 1 : 0
      );
      const game = await db.prepare('SELECT id FROM games WHERE slug = ?').get(slug);
      await auditLog('admin_game_create', { target: `game:${slug}` });
      res.status(201).json({ id: game?.id, slug });
    } catch (err) {
      if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists.' });
      console.error(err); res.status(500).json({ error: 'Failed.' });
    }
  });

  router.put('/games/:id', async (req, res) => {
    try {
      const game = await db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.id);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      const fields = ['title','slug','price','sale_price','image','genre','platform','description','developer','publisher','release_date','tags','size','featured','trending','free_to_play','rating'];
      const sets = [], vals = [];
      const updatedValues = {};
      for (const f of fields) {
        if (!(f in req.body)) continue;
        let v = req.body[f];
        if (f === 'slug' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(v))) {
          return res.status(400).json({ error: 'slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens).' });
        }
        if (f === 'price') { v = Number(v); if (isNaN(v) || v < 0) return res.status(400).json({ error: 'price must be a non-negative number.' }); }
        else if (f === 'sale_price') { v = v != null ? Number(v) : null; if (v !== null && (isNaN(v) || v < 0)) return res.status(400).json({ error: 'sale_price must be a non-negative number.' }); }
        else if (f === 'rating') v = Number(v);
        else if (['genre','platform','tags'].includes(f)) v = JSON.stringify(Array.isArray(v) ? v : []);
        else if (['featured','trending','free_to_play'].includes(f)) v = v ? 1 : 0;
        sets.push(`${f} = ?`); vals.push(v);
        updatedValues[f] = v;
      }
      if (!sets.length) return res.status(400).json({ error: 'No valid fields provided.' });
      if (updatedValues.sale_price != null && updatedValues.price != null && updatedValues.sale_price >= updatedValues.price)
        return res.status(400).json({ error: 'sale_price must be less than price.' });
      vals.push(req.params.id);
      await db.prepare(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      await auditLog('admin_game_update', { target: `game:${req.params.id}` });
      res.json({ success: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists.' });
      console.error(err); res.status(500).json({ error: 'Failed.' });
    }
  });

  router.delete('/games/:id', async (req, res) => {
    try {
      const game = await db.prepare('SELECT id, title FROM games WHERE id = ?').get(req.params.id);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      await db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
      await auditLog('admin_game_delete', { target: `game:${req.params.id}`, meta: { title: game.title } });
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Users ──────────────────────────────────────────────
  router.get('/users', async (req, res) => {
    try {
      const { search, limit = 50, offset = 0 } = req.query;
      let q = 'SELECT id, username, email, display_name, level, xp, balance, is_verified, is_admin, tfa_enabled, created_at, last_login, locked_until FROM users WHERE 1=1';
      const p = [];
      if (search) { q += ' AND (username LIKE ? OR email LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
      q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      p.push(Math.min(200, parseInt(limit) || 50), Math.max(0, parseInt(offset) || 0));
      const total = (await db.prepare('SELECT COUNT(*) as c FROM users').get()).c;
      res.json({ users: await db.prepare(q).all(...p), total });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.get('/users/:id', async (req, res) => {
    try {
      const user = await db.prepare('SELECT id, username, email, display_name, level, xp, balance, is_verified, is_admin, tfa_enabled, created_at, last_login, locked_until, bio, avatar_url FROM users WHERE id = ?').get(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const orders = await db.prepare('SELECT id, total, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
      res.json({ user, orders });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.patch('/users/:id', async (req, res) => {
    try {
      const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const { is_verified, is_admin, balance, locked_until } = req.body;
      const sets = [], vals = [];
      if (is_verified !== undefined) { sets.push('is_verified = ?'); vals.push(is_verified ? 1 : 0); }
      if (is_admin !== undefined)    { sets.push('is_admin = ?');    vals.push(is_admin ? 1 : 0); }
      if (balance !== undefined) {
        const b = Number(balance);
        if (isNaN(b) || b < 0 || b > 1000000) return res.status(400).json({ error: 'Invalid balance (must be 0–1,000,000).' });
        sets.push('balance = ?'); vals.push(b);
      }
      if (locked_until !== undefined) {
        sets.push('locked_until = ?'); vals.push(locked_until || null);
      }
      if (!sets.length) return res.status(400).json({ error: 'No valid fields provided.' });
      vals.push(req.params.id);
      await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      await auditLog('admin_user_update', { target: `user:${req.params.id}`, meta: req.body });
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.delete('/users/:id', async (req, res) => {
    try {
      const user = await db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
      await auditLog('admin_user_delete', { target: `user:${req.params.id}`, meta: { username: user.username } });
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Orders ─────────────────────────────────────────────
  router.get('/orders', async (req, res) => {
    try {
      const { user_id, limit = 50, offset = 0 } = req.query;
      let q = 'SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE 1=1';
      const p = [];
      if (user_id) { q += ' AND o.user_id = ?'; p.push(user_id); }
      q += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
      p.push(Math.min(200, parseInt(limit) || 50), Math.max(0, parseInt(offset) || 0));
      const total = (await db.prepare('SELECT COUNT(*) as c FROM orders').get()).c;
      res.json({ orders: await db.prepare(q).all(...p), total });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.get('/orders/:id', async (req, res) => {
    try {
      const order = await db.prepare('SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      const items = await db.prepare('SELECT oi.price_paid, g.id as game_id, g.title, g.image FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = ?').all(req.params.id);
      res.json({ order, items });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Support tickets ─────────────────────────────────────
  router.get('/support', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const tickets = await db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Math.min(200, parseInt(limit) || 50), Math.max(0, parseInt(offset) || 0));
      const total = (await db.prepare('SELECT COUNT(*) as c FROM support_tickets').get()).c;
      res.json({ tickets, total });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Audit log ──────────────────────────────────────────
  router.get('/audit-log', async (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const logs = await db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Math.min(500, parseInt(limit) || 100), Math.max(0, parseInt(offset) || 0));
      res.json({ logs });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  return router;
};
