/**
 * GAMEGLITZ — Database Setup & Schema
 * SQLite via better-sqlite3 (native, synchronous, 100× faster than sql.js at write)
 *
 * Migration note: the existing `gameglitz.db` file written by sql.js is a
 * standard SQLite file, so better-sqlite3 opens it unchanged — no schema
 * migration, no data loss.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'gameglitz.db');
let _db = null;

function createDatabase() {
  if (_db) return _db;

  const db = new Database(DB_PATH);

  // WAL gives us concurrent reads with a single writer — huge win over sql.js,
  // which serialized *every* access and rewrote the whole DB on each commit.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');   // NORMAL is safe with WAL and much faster
  db.pragma('busy_timeout = 5000');

  // ──────────────────────────────────────────────
  // USERS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      username        TEXT UNIQUE NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      phone           TEXT UNIQUE DEFAULT NULL,
      display_name    TEXT NOT NULL,
      password_hash   TEXT NOT NULL,
      avatar_url      TEXT DEFAULT NULL,
      bio             TEXT DEFAULT '',
      level           INTEGER DEFAULT 1,
      xp              INTEGER DEFAULT 0,
      balance         REAL DEFAULT 0.0,
      is_verified     INTEGER DEFAULT 0,
      failed_login_count INTEGER DEFAULT 0,
      locked_until    TEXT DEFAULT NULL,
      tfa_enabled     INTEGER DEFAULT 0,
      tfa_secret      TEXT DEFAULT NULL,
      social_provider TEXT DEFAULT NULL,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      last_login      TEXT DEFAULT NULL
    )
  `);

  // Migrations: add columns/indexes if missing (safe on existing databases)
  // NOTE: SQLite does not allow adding a UNIQUE column via ALTER TABLE,
  // so phone must be added first, then indexed separately.
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map(col => col.name);
  if (!userColumns.includes('social_provider')) {
    try { db.exec('ALTER TABLE users ADD COLUMN social_provider TEXT DEFAULT NULL'); } catch { /* already exists */ }
  }
  if (!userColumns.includes('phone')) {
    try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL'); } catch { /* already exists */ }
  }
  if (!userColumns.includes('failed_login_count')) {
    try { db.exec('ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0'); } catch { /* already exists */ }
  }
  if (!userColumns.includes('locked_until')) {
    try { db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT DEFAULT NULL'); } catch { /* already exists */ }
  }
  if (!userColumns.includes('is_admin')) {
    try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch { /* already exists */ }
  }
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL');
  } catch {
    // Ignore index creation errors on legacy DBs with bad data.
  }

  // ──────────────────────────────────────────────
  // SESSIONS (JWT tracking for logout-all)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      device     TEXT,
      ip         TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  // ──────────────────────────────────────────────
  // GAMES (master catalog — seeded from game-database.js)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id           INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      slug         TEXT UNIQUE NOT NULL,
      price        REAL NOT NULL DEFAULT 0,
      sale_price   REAL DEFAULT NULL,
      image        TEXT,
      genre        TEXT,           -- JSON array
      platform     TEXT,           -- JSON array
      rating       REAL DEFAULT 0,
      reviews      INTEGER DEFAULT 0,
      developer    TEXT,
      publisher    TEXT,
      release_date TEXT,
      description  TEXT,
      tags         TEXT,           -- JSON array
      size         TEXT,
      featured     INTEGER DEFAULT 0,
      trending     INTEGER DEFAULT 0,
      new_release  INTEGER DEFAULT 0,
      free_to_play INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrations: add game columns if missing
  const gameColumns = db.prepare('PRAGMA table_info(games)').all().map(col => col.name);
  if (!gameColumns.includes('trailer_url')) {
    try { db.exec('ALTER TABLE games ADD COLUMN trailer_url TEXT DEFAULT NULL'); } catch {}
  }
  if (!gameColumns.includes('screenshots')) {
    try { db.exec('ALTER TABLE games ADD COLUMN screenshots TEXT DEFAULT NULL'); } catch {}
  }
  if (!gameColumns.includes('system_requirements')) {
    try { db.exec('ALTER TABLE games ADD COLUMN system_requirements TEXT DEFAULT NULL'); } catch {}
  }
  if (!gameColumns.includes('content_rating')) {
    try { db.exec('ALTER TABLE games ADD COLUMN content_rating TEXT DEFAULT NULL'); } catch {}
  }

  // Fix image paths: replace .jpg extensions with .webp for games where only .webp exists
  try {
    db.exec(`
      UPDATE games
      SET image = SUBSTR(image, 1, LENGTH(image) - 4) || '.webp'
      WHERE image LIKE '%.jpg'
        AND image NOT LIKE '%ac-mirage%'
        AND image NOT LIKE '%gta6%'
        AND image NOT LIKE '%fifa26%'
    `);
  } catch {}

  // ──────────────────────────────────────────────
  // NORMALIZED GAME TAXONOMY (genres/platforms/tags)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_genres (
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      genre   TEXT NOT NULL,
      PRIMARY KEY (game_id, genre)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game_platforms (
      game_id  INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      PRIMARY KEY (game_id, platform)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game_tags (
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      tag     TEXT NOT NULL,
      PRIMARY KEY (game_id, tag)
    )
  `);

  // ──────────────────────────────────────────────
  // CART
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id  INTEGER NOT NULL REFERENCES games(id),
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, game_id)
    )
  `);

  // ──────────────────────────────────────────────
  // WISHLIST
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id  INTEGER NOT NULL REFERENCES games(id),
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, game_id)
    )
  `);

  // ──────────────────────────────────────────────
  // LIBRARY (owned games)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS library (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id     INTEGER NOT NULL REFERENCES games(id),
      play_time   INTEGER DEFAULT 0,   -- minutes
      last_played TEXT DEFAULT NULL,
      installed   INTEGER DEFAULT 0,
      acquired_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, game_id)
    )
  `);

  // ──────────────────────────────────────────────
  // ORDERS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total          REAL NOT NULL,
      savings        REAL DEFAULT 0,
      status         TEXT DEFAULT 'completed',
      payment_method TEXT DEFAULT 'GameGlitz Wallet',
      created_at     TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      game_id    INTEGER NOT NULL REFERENCES games(id),
      price_paid REAL NOT NULL
    )
  `);

  // ──────────────────────────────────────────────
  // REVIEWS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id    INTEGER NOT NULL REFERENCES games(id),
      rating     INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title      TEXT,
      body       TEXT,
      helpful    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, game_id)
    )
  `);

  // ──────────────────────────────────────────────
  // COMMUNITY: GROUPS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      description TEXT,
      image       TEXT,
      owner_id    TEXT NOT NULL REFERENCES users(id),
      is_public   INTEGER DEFAULT 1,
      member_count INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT DEFAULT 'member',  -- owner, admin, member
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    )
  `);

  // ──────────────────────────────────────────────
  // COMMUNITY: POSTS / DISCUSSIONS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id   TEXT REFERENCES groups(id) ON DELETE CASCADE,
      game_id    INTEGER REFERENCES games(id),
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      likes      INTEGER DEFAULT 0,
      replies    INTEGER DEFAULT 0,
      pinned     INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS post_replies (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      likes      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ──────────────────────────────────────────────
  // FRIENDS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT DEFAULT 'pending',  -- pending, accepted, blocked
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, friend_id)
    )
  `);

  // ──────────────────────────────────────────────
  // NOTIFICATIONS
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT,
      link       TEXT,
      read       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ──────────────────────────────────────────────
  // AUDIT LOG
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      action     TEXT NOT NULL,
      target     TEXT,          -- e.g. 'user:abc123', 'order:xyz'
      meta       TEXT,          -- JSON blob of extra context
      ip         TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // SUPPORT TICKETS
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id         TEXT PRIMARY KEY,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      email      TEXT NOT NULL,
      category   TEXT DEFAULT NULL,
      subject    TEXT NOT NULL,
      message    TEXT NOT NULL,
      status     TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add category column if missing
  const ticketColumns = db.prepare('PRAGMA table_info(support_tickets)').all().map(col => col.name);
  if (!ticketColumns.includes('category')) {
    try { db.exec('ALTER TABLE support_tickets ADD COLUMN category TEXT DEFAULT NULL'); } catch { /* already exists */ }
  }

  // PASSWORD RESET + EMAIL VERIFICATION TOKENS
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT DEFAULT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      token_hash  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT DEFAULT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_evt_hash ON email_verification_tokens(token_hash);
  `);

  // ──────────────────────────────────────────────
  // INDEXES
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cart_user           ON cart_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_wishlist_user        ON wishlist_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_library_user         ON library(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_created       ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_game         ON reviews(game_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_user         ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_group          ON posts(group_id);
    CREATE INDEX IF NOT EXISTS idx_friends_user         ON friends(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read   ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_games_slug           ON games(slug);
    CREATE INDEX IF NOT EXISTS idx_games_title          ON games(title);
    CREATE INDEX IF NOT EXISTS idx_games_developer      ON games(developer);
    CREATE INDEX IF NOT EXISTS idx_games_tags           ON games(tags);
    CREATE INDEX IF NOT EXISTS idx_games_flags          ON games(featured, trending, new_release);
    CREATE INDEX IF NOT EXISTS idx_games_price          ON games(price);
    CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash  ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires     ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user           ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_support_user         ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_game_genres_genre    ON game_genres(genre);
    CREATE INDEX IF NOT EXISTS idx_game_platforms_name  ON game_platforms(platform);
    CREATE INDEX IF NOT EXISTS idx_game_tags_name       ON game_tags(tag);
  `);

  _db = db;
  return db;
}

module.exports = { createDatabase, DB_PATH };
