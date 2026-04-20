const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();

function effectivePrice(game) {
  if (!game) return 0;
  return (game.sale_price !== null && game.sale_price !== undefined) ? Number(game.sale_price) : Number(game.price || 0);
}

module.exports = function createCartRouter({ db, requireAuth, requireVerifiedUser }) {
  router.get('/', requireAuth, async (req, res) => {
    const items = await db.prepare('SELECT c.id as cart_id, c.added_at, g.* FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.user_id = ? ORDER BY c.added_at DESC').all(req.user.id);
    const total = items.reduce((s, g) => s + effectivePrice(g), 0);
    const savings = items.reduce((s, g) => s + ((g.sale_price !== null && g.sale_price !== undefined) ? Number(g.price) - Number(g.sale_price) : 0), 0);
    res.json({ items, total: Math.round(total * 100) / 100, savings: Math.round(savings * 100) / 100, count: items.length });
  });

  router.post('/add', requireAuth, async (req, res) => {
    try {
      const game_id = parseInt(req.body.game_id);
      if (!game_id || isNaN(game_id)) return res.status(400).json({ error: 'game_id must be a valid integer.' });
      const game = await db.prepare('SELECT id FROM games WHERE id = ?').get(game_id);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      const owned = await db.prepare('SELECT 1 as v FROM library WHERE user_id = ? AND game_id = ?').get(req.user.id, game_id);
      if (owned) return res.status(400).json({ error: 'You already own this game.' });
      await db.prepare('INSERT INTO cart_items (user_id, game_id) VALUES (?, ?)').run(req.user.id, game_id);
      res.json({ success: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627') || err.message?.includes('2601')) return res.status(400).json({ error: 'Already in cart.' });
      console.error('Cart add error:', err); res.status(500).json({ error: 'Failed to add to cart.' });
    }
  });

  router.delete('/:gameId', requireAuth, async (req, res) => {
    const gameId = parseInt(req.params.gameId);
    if (!gameId || isNaN(gameId)) return res.status(400).json({ error: 'Invalid game ID.' });
    await db.prepare('DELETE FROM cart_items WHERE user_id = ? AND game_id = ?').run(req.user.id, gameId);
    res.json({ success: true });
  });

  router.delete('/', requireAuth, async (req, res) => {
    await db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  });

  router.post('/checkout', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const items = await db.prepare('SELECT g.* FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.user_id = ?').all(req.user.id);
      if (!items.length) return res.status(400).json({ error: 'Cart is empty.' });
      const total   = Math.round(items.reduce((s, g) => s + effectivePrice(g), 0) * 100) / 100;
      const savings = Math.round(items.reduce((s, g) => s + ((g.sale_price !== null && g.sale_price !== undefined) ? Number(g.price) - Number(g.sale_price) : 0), 0) * 100) / 100;
      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const uid = req.user.id;
      await db.transaction(async () => {
        const user = await db.prepare('SELECT balance FROM users WHERE id = ?').get(uid);
        if (Number(user.balance) < total)
          throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE', available: Number(user.balance), required: total });
        await db.prepare('INSERT INTO orders (id, user_id, total, savings) VALUES (?, ?, ?, ?)').run(orderId, uid, total, savings);
        for (const g of items) {
          await db.prepare('INSERT INTO order_items (order_id, game_id, price_paid) VALUES (?, ?, ?)').run(orderId, g.id, effectivePrice(g));
          await db.prepare('INSERT OR IGNORE INTO library (user_id, game_id) VALUES (?, ?)').run(uid, g.id);
        }
        await db.prepare('UPDATE users SET balance = balance - ?, xp = xp + ? WHERE id = ?').run(total, Math.floor(total * 2), uid);
        await db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(uid);
        for (const g of items) await db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND game_id = ?').run(uid, g.id);
      })();
      const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
      let xp = u.xp, lv = u.level;
      while (xp >= lv * 100) { xp -= lv * 100; lv++; }
      if (lv !== u.level) await db.prepare('UPDATE users SET level = ?, xp = ? WHERE id = ?').run(lv, xp, uid);
      await db.prepare('INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)').run(uuid(), uid, 'order', 'Order Confirmed!', `Order ${orderId} — ${items.length} game(s) for $${total.toFixed(2)}`);
      const finalUser  = await db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
      const orderItems = items.map(g => ({ title: g.title, image: g.image, slug: g.slug, price_paid: effectivePrice(g) }));
      const { password_hash, tfa_secret, failed_login_count, locked_until, ...safeUser } = finalUser;
      res.json({ order: { id: orderId, items: orderItems, total, savings, status: 'completed' }, user: safeUser });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: `Insufficient balance ($${err.available.toFixed(2)} available, $${err.required.toFixed(2)} required).` });
      console.error('Checkout error:', err); res.status(500).json({ error: 'Checkout failed. Please try again.' });
    }
  });

  return router;
};
