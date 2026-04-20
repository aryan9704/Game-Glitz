const express = require('express');
const router = express.Router();

function effectivePrice(game) {
  if (!game) return 0;
  return (game.sale_price !== null && game.sale_price !== undefined) ? Number(game.sale_price) : Number(game.price || 0);
}

function parseGameIds(value) {
  const parts = String(value || '')
    .split(',')
    .map(raw => raw.trim())
    .filter(Boolean);
  const ids = parts.map(raw => Number(raw));
  return ids.length && ids.every(id => Number.isInteger(id) && id > 0) ? ids : [];
}

module.exports = function createStripeRouter({ db, requireAuth, requireVerifiedUser, auditLog, baseUrl }) {
  let _stripe = null;
  function getStripe() {
    if (_stripe) return _stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    const Stripe = require('stripe');
    _stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
    return _stripe;
  }

  router.post('/', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on this server.', configured: false });
      const items = await db.prepare('SELECT g.* FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.user_id = ?').all(req.user.id);
      if (!items.length) return res.status(400).json({ error: 'Cart is empty.' });
      const origin = baseUrl(req);
      const line_items = items.map(g => {
        let images = [];
        try {
          if (g.image) {
            const abs = g.image.startsWith('http') ? g.image : `${origin}/${String(g.image).replace(/^\//,'')}`;
            images = [abs];
          }
        } catch {}
        return { price_data: { currency: 'usd', product_data: { name: String(g.title).slice(0, 250), images }, unit_amount: Math.round(effectivePrice(g) * 100) }, quantity: 1 };
      });
      const session = await stripe.checkout.sessions.create({ mode: 'payment', line_items, customer_email: req.user.email, client_reference_id: req.user.id, metadata: { user_id: req.user.id, game_ids: items.map(g => g.id).join(',') }, success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/checkout/cancelled` });
      await auditLog('stripe_session_created', { userId: req.user.id, target: `session:${session.id}`, meta: { amount_total: session.amount_total, currency: session.currency }, ip: req.ip });
      res.json({ id: session.id, url: session.url });
    } catch (err) { console.error('Stripe checkout error:', err); res.status(500).json({ error: err.message || 'Stripe checkout failed.' }); }
  });

  router.post('/webhook', require('express').raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) return res.status(503).send('Stripe webhook not configured');
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret); }
    catch (err) { console.warn('Stripe webhook signature verify failed:', err.message); return res.status(400).send(`Webhook signature failed: ${err.message}`); }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata && session.metadata.user_id;
      const gameIds = parseGameIds(session.metadata && session.metadata.game_ids);
      if (userId && gameIds.length) {
        try {
          if (session.client_reference_id !== userId) {
            console.error('Stripe webhook: client_reference_id/user_id mismatch:', session.id);
            res.json({ received: true });
            return;
          }
          const user = await db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
          if (!user) { console.error('Stripe webhook: user_id not found:', userId); res.json({ received: true }); return; }
          if (session.customer_email && String(session.customer_email).toLowerCase() !== String(user.email).toLowerCase()) {
            console.error('Stripe webhook: customer_email/user mismatch:', session.id);
            res.json({ received: true });
            return;
          }
          const placeholders = gameIds.map(() => '?').join(',');
          const games = await db.prepare(`SELECT id, price, sale_price FROM games WHERE id IN (${placeholders})`).all(...gameIds);
          if (games.length !== new Set(gameIds).size) {
            console.error('Stripe webhook: unknown game id in session:', session.id);
            res.json({ received: true });
            return;
          }
          const expectedTotal = Math.round(games.reduce((sum, game) => sum + effectivePrice(game), 0) * 100);
          if (Number(session.amount_total || 0) !== expectedTotal) {
            console.error('Stripe webhook: amount mismatch:', session.id);
            res.json({ received: true });
            return;
          }
          const priceByGameId = new Map(games.map(game => [Number(game.id), effectivePrice(game)]));
          const orderId = 'ORD-ST-' + (session.id || '').slice(-10).toUpperCase();
          const total = (session.amount_total || 0) / 100;
          await db.transaction(async () => {
            const created = await db.prepare('INSERT OR IGNORE INTO orders (id, user_id, total, savings) VALUES (?, ?, ?, ?)').run(orderId, userId, total, 0);
            if (!created.changes) {
              console.warn('Stripe webhook: duplicate order skipped:', orderId);
              return;
            }
            for (const gid of gameIds) {
              await db.prepare('INSERT OR IGNORE INTO order_items (order_id, game_id, price_paid) VALUES (?, ?, ?)').run(orderId, gid, priceByGameId.get(gid) || 0);
              await db.prepare('INSERT OR IGNORE INTO library (user_id, game_id) VALUES (?, ?)').run(userId, gid);
            }
            await db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
          })();
          await auditLog('stripe_payment_completed', { userId, target: `order:${orderId}`, meta: { session_id: session.id, total } });
        } catch (err) { console.error('Stripe webhook order write error:', err); }
      }
    }
    res.json({ received: true });
  });

  return router;
};
