/**
 * reseed.js — GameGlitz database reset & seed utility
 *
 * Usage:
 *   node server/reseed.js            # seed games only (safe — skips if games exist)
 *   node server/reseed.js --reset    # drop DB file, recreate schema, re-seed games
 *   node server/reseed.js --games    # force re-seed games even if rows exist
 *
 * WARNING: --reset wipes ALL data (accounts, orders, sessions, etc.)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RESET      = process.argv.includes('--reset');
const FORCE_SEED = process.argv.includes('--games') || RESET;

async function main() {
  const fs = require('fs');

  if (RESET) {
    const { DB_PATH } = require('./database');
    if (fs.existsSync(DB_PATH)) {
      const backup = DB_PATH + '.bak-' + Date.now();
      fs.copyFileSync(DB_PATH, backup);
      console.log(`Backed up existing DB → ${backup}`);
      fs.unlinkSync(DB_PATH);
      console.log('Deleted old database file.');
    }
    // Bust module cache so createDatabase() starts completely fresh
    Object.keys(require.cache)
      .filter(k => k.includes('database') || k.includes('/db'))
      .forEach(k => delete require.cache[k]);
  }

  const { db, initialize } = require('./db');
  await initialize();
  console.log('Schema initialised.');

  // ── Check if we should seed ──────────────────────────────
  const row = await db.prepare('SELECT COUNT(*) as c FROM games').get();
  if (row.c > 0 && !FORCE_SEED) {
    console.log(`Games table already has ${row.c} rows.`);
    console.log('Use --games to force re-seed, or --reset to wipe and start fresh.');
    process.exit(0);
  }

  if (FORCE_SEED && row.c > 0) {
    // Clear game-dependent tables first to avoid FK violations
    for (const tbl of ['order_items', 'reviews', 'library', 'wishlist_items', 'cart_items', 'game_genres', 'game_platforms', 'game_tags']) {
      try {
        await db.prepare(`DELETE FROM ${tbl}`).run();
      } catch (err) {
        console.error(`Failed to clear table "${tbl}":`, err.message);
        throw err;
      }
    }
    await db.prepare('DELETE FROM games').run();
    console.log('Cleared existing game rows.');
  }

  // ── Load game-database.js ────────────────────────────────
  const dbPath = fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'game-database.js'))
    ? path.join(__dirname, '..', 'public', 'js', 'game-database.js')
    : path.join(__dirname, '..', 'js', 'game-database.js');
  if (!fs.existsSync(dbPath)) {
    console.warn('js/game-database.js not found — no games seeded.');
    process.exit(1);
  }

  const content = fs.readFileSync(dbPath, 'utf-8');
  const match   = content.match(/const GAME_DATABASE\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.error('Could not locate GAME_DATABASE array in game-database.js.');
    process.exit(1);
  }

  let games;
  try {
    const vm = require('vm');
    games = vm.runInNewContext('(' + match[1] + ')');
  } catch (e) {
    console.error('Failed to parse GAME_DATABASE:', e.message);
    process.exit(1);
  }
  console.log(`Parsed ${games.length} games from game-database.js`);

  let ok = 0, fail = 0;
  for (const g of games) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO games
          (id, title, slug, price, sale_price, image, genre, platform, rating, reviews,
           developer, publisher, release_date, description, tags, size,
           featured, trending, new_release, free_to_play)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        g.id, g.title, g.slug, g.price, g.salePrice ?? null, g.image,
        JSON.stringify(g.genre),    JSON.stringify(g.platform),
        g.rating, g.reviews || 0,
        g.developer, g.publisher, g.releaseDate, g.description,
        JSON.stringify(g.tags), g.size ?? null,
        g.featured    ? 1 : 0,
        g.trending    ? 1 : 0,
        g.newRelease  ? 1 : 0,
        g.freeToPlay  ? 1 : 0
      );

      for (const genre of (g.genre || [])) {
        await db.prepare('INSERT OR IGNORE INTO game_genres (game_id, genre) VALUES (?, ?)').run(g.id, genre);
      }
      for (const platform of (g.platform || [])) {
        await db.prepare('INSERT OR IGNORE INTO game_platforms (game_id, platform) VALUES (?, ?)').run(g.id, platform);
      }
      for (const tag of (g.tags || [])) {
        await db.prepare('INSERT OR IGNORE INTO game_tags (game_id, tag) VALUES (?, ?)').run(g.id, tag);
      }

      ok++;
    } catch (e) {
      fail++;
      console.warn(`  Skipped "${g.title}" (id=${g.id}): ${e.message}`);
    }
  }

  const total = await db.prepare('SELECT COUNT(*) as c FROM games').get();
  console.log(`Done: ${ok} inserted, ${fail} skipped — ${total.c} total games in DB.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Reseed failed:', err);
  process.exit(1);
});
