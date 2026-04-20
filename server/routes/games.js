const express = require('express');
const router = express.Router();

function effectivePrice(game) {
  if (!game) return 0;
  return (game.sale_price !== null && game.sale_price !== undefined)
    ? Number(game.sale_price)
    : Number(game.price || 0);
}

module.exports = function createGamesRouter({ db, optionalAuth }) {
  router.get('/', optionalAuth, async (req, res) => {
    try {
      const { search, genre, platform, price, sort, featured, trending, free, sale, limit = 50, offset = 0 } = req.query;
      const limitN = Math.max(1, Math.min(200, parseInt(limit) || 50));
      const offsetN = Math.max(0, parseInt(offset) || 0);
      let q = 'SELECT * FROM games WHERE 1=1';
      let qCount = 'SELECT COUNT(*) as count FROM games WHERE 1=1';
      const p = [], pCount = [];
      function addFilter(clause, ...vals) { q += clause; qCount += clause; p.push(...vals); pCount.push(...vals); }
      if (search)  { addFilter(' AND (title LIKE ? OR developer LIKE ? OR tags LIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`); }
      if (genre)   { addFilter(' AND genre LIKE ?', `%${genre}%`); }
      if (platform){ addFilter(' AND platform LIKE ?', `%${platform}%`); }
      if (price === 'under10') { addFilter(' AND COALESCE(sale_price, price) < 10'); }
      if (price === 'under30') { addFilter(' AND COALESCE(sale_price, price) < 30'); }
      if (price === 'under60') { addFilter(' AND COALESCE(sale_price, price) < 60'); }
      if (featured === '1')   { addFilter(' AND featured = 1'); }
      if (trending === '1')   { addFilter(' AND trending = 1'); }
      if (free === '1')       { addFilter(' AND free_to_play = 1'); }
      if (sale === '1')       { addFilter(' AND sale_price IS NOT NULL'); }
      if (sort === 'price-asc')       q += ' ORDER BY COALESCE(sale_price, price) ASC';
      else if (sort === 'price-desc') q += ' ORDER BY COALESCE(sale_price, price) DESC';
      else if (sort === 'rating')     q += ' ORDER BY rating DESC';
      else if (sort === 'newest')     q += ' ORDER BY release_date DESC';
      else if (sort === 'title')      q += ' ORDER BY title ASC';
      else                            q += ' ORDER BY featured DESC, rating DESC';
      q += ' LIMIT ? OFFSET ?';
      p.push(limitN, offsetN);
      const [games, totalRow] = await Promise.all([db.prepare(q).all(...p), db.prepare(qCount).get(...pCount)]);
      res.json({ games, total: totalRow.count, limit: limitN, offset: offsetN });
    } catch (err) { console.error('Games error:', err); res.status(500).json({ error: 'Failed to fetch games.' }); }
  });

  router.get('/:idOrSlug', optionalAuth, async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      const game = await db.prepare('SELECT * FROM games WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      const reviews = await db.prepare(`SELECT r.*, u.username, u.display_name, u.avatar_url FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.game_id = ? ORDER BY r.created_at DESC`).all(game.id);
      let userState = null;
      if (req.user) {
        userState = {
          inCart: !!(await db.prepare('SELECT 1 as v FROM cart_items WHERE user_id = ? AND game_id = ?').get(req.user.id, game.id)),
          inWishlist: !!(await db.prepare('SELECT 1 as v FROM wishlist_items WHERE user_id = ? AND game_id = ?').get(req.user.id, game.id)),
          owned: !!(await db.prepare('SELECT 1 as v FROM library WHERE user_id = ? AND game_id = ?').get(req.user.id, game.id)),
        };
      }
      // Related games (same genre, exclude self)
      const genre = game.genre || '[]';
      let firstGenre = '';
      try { const genres = JSON.parse(genre); firstGenre = (Array.isArray(genres) && genres[0]) ? String(genres[0]).trim() : ''; } catch { firstGenre = ''; }
      const related = firstGenre
        ? await db.prepare('SELECT id, title, slug, image, price, sale_price, rating FROM games WHERE id != ? AND genre LIKE ? ORDER BY rating DESC LIMIT 6').all(game.id, `%${firstGenre}%`)
        : [];
      res.json({ game, reviews, userState, related });
    } catch (err) { console.error('Game detail error:', err); res.status(500).json({ error: 'Failed to fetch game.' }); }
  });

  return router;
};
