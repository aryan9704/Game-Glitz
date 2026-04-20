/**
 * GAMEGLITZ — SQL Server DDL (used only when USE_SQL_SERVER=true)
 * All statements are idempotent — safe to re-run on every boot.
 */
module.exports = [
  // ── USERS ──────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
CREATE TABLE dbo.users (
  id            NVARCHAR(100)  PRIMARY KEY,
  username      NVARCHAR(255)  NOT NULL UNIQUE,
  email         NVARCHAR(255)  NOT NULL UNIQUE,
  phone         NVARCHAR(30)   NULL,
  display_name  NVARCHAR(255)  NOT NULL,
  password_hash NVARCHAR(255)  NOT NULL,
  avatar_url    NVARCHAR(MAX)  NULL,
  bio           NVARCHAR(MAX)  NOT NULL DEFAULT '',
  level         INT            NOT NULL DEFAULT 1,
  xp            INT            NOT NULL DEFAULT 0,
  balance       DECIMAL(18,2)  NOT NULL DEFAULT 0.0,
  is_verified   BIT            NOT NULL DEFAULT 0,
  failed_login_count INT       NOT NULL DEFAULT 0,
  locked_until  DATETIME2      NULL,
  tfa_enabled   BIT            NOT NULL DEFAULT 0,
  tfa_secret    NVARCHAR(255)  NULL,
  social_provider NVARCHAR(50) NULL,
  created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  last_login    DATETIME2      NULL
);
END`,
  // Migrations for existing users tables
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='phone')
    ALTER TABLE dbo.users ADD phone NVARCHAR(30) NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='failed_login_count')
    ALTER TABLE dbo.users ADD failed_login_count INT NOT NULL DEFAULT 0`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='locked_until')
    ALTER TABLE dbo.users ADD locked_until DATETIME2 NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='social_provider')
    ALTER TABLE dbo.users ADD social_provider NVARCHAR(50) NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.users') AND name='is_admin')
    ALTER TABLE dbo.users ADD is_admin BIT NOT NULL DEFAULT 0`,

  // ── SESSIONS ───────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.sessions', 'U') IS NULL
CREATE TABLE dbo.sessions (
  id         NVARCHAR(100) PRIMARY KEY,
  user_id    NVARCHAR(100) NOT NULL,
  token_hash NVARCHAR(255) NOT NULL,
  device     NVARCHAR(255) NULL,
  ip         NVARCHAR(100) NULL,
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  expires_at DATETIME2     NOT NULL
)`,

  // ── GAMES ──────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.games', 'U') IS NULL
CREATE TABLE dbo.games (
  id           INT            PRIMARY KEY,
  title        NVARCHAR(500)  NOT NULL,
  slug         NVARCHAR(500)  NOT NULL UNIQUE,
  price        DECIMAL(18,2)  NOT NULL DEFAULT 0,
  sale_price   DECIMAL(18,2)  NULL,
  image        NVARCHAR(MAX)  NULL,
  genre        NVARCHAR(MAX)  NULL,
  platform     NVARCHAR(MAX)  NULL,
  rating       DECIMAL(4,2)   DEFAULT 0,
  reviews      INT            DEFAULT 0,
  developer    NVARCHAR(255)  NULL,
  publisher    NVARCHAR(255)  NULL,
  release_date NVARCHAR(50)   NULL,
  description  NVARCHAR(MAX)  NULL,
  tags         NVARCHAR(MAX)  NULL,
  size         NVARCHAR(100)  NULL,
  featured     BIT            DEFAULT 0,
  trending     BIT            DEFAULT 0,
  new_release  BIT            DEFAULT 0,
  free_to_play BIT            DEFAULT 0,
  created_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,
  // Migrations for existing games tables
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.games') AND name='trailer_url')
    ALTER TABLE dbo.games ADD trailer_url NVARCHAR(MAX) NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.games') AND name='screenshots')
    ALTER TABLE dbo.games ADD screenshots NVARCHAR(MAX) NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.games') AND name='system_requirements')
    ALTER TABLE dbo.games ADD system_requirements NVARCHAR(MAX) NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.games') AND name='content_rating')
    ALTER TABLE dbo.games ADD content_rating NVARCHAR(50) NULL`,

  // ── GAME TAXONOMY ──────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.game_genres', 'U') IS NULL
CREATE TABLE dbo.game_genres (
  game_id INT           NOT NULL,
  genre   NVARCHAR(100) NOT NULL,
  PRIMARY KEY (game_id, genre)
)`,
  `IF OBJECT_ID('dbo.game_platforms', 'U') IS NULL
CREATE TABLE dbo.game_platforms (
  game_id  INT           NOT NULL,
  platform NVARCHAR(100) NOT NULL,
  PRIMARY KEY (game_id, platform)
)`,
  `IF OBJECT_ID('dbo.game_tags', 'U') IS NULL
CREATE TABLE dbo.game_tags (
  game_id INT           NOT NULL,
  tag     NVARCHAR(100) NOT NULL,
  PRIMARY KEY (game_id, tag)
)`,

  // ── CART ───────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.cart_items', 'U') IS NULL
CREATE TABLE dbo.cart_items (
  id       BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id  NVARCHAR(100) NOT NULL,
  game_id  INT           NOT NULL,
  added_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (user_id, game_id)
)`,

  // ── WISHLIST ───────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.wishlist_items', 'U') IS NULL
CREATE TABLE dbo.wishlist_items (
  id       BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id  NVARCHAR(100) NOT NULL,
  game_id  INT           NOT NULL,
  added_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (user_id, game_id)
)`,

  // ── LIBRARY ────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.library', 'U') IS NULL
CREATE TABLE dbo.library (
  id          BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id     NVARCHAR(100) NOT NULL,
  game_id     INT           NOT NULL,
  play_time   INT           DEFAULT 0,
  last_played DATETIME2     NULL,
  installed   BIT           DEFAULT 0,
  acquired_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (user_id, game_id)
)`,

  // ── ORDERS ─────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.orders', 'U') IS NULL
CREATE TABLE dbo.orders (
  id             NVARCHAR(100)  PRIMARY KEY,
  user_id        NVARCHAR(100)  NOT NULL,
  total          DECIMAL(18,2)  NOT NULL,
  savings        DECIMAL(18,2)  DEFAULT 0,
  status         NVARCHAR(50)   DEFAULT 'completed',
  payment_method NVARCHAR(100)  DEFAULT 'GameGlitz Wallet',
  created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,
  `IF OBJECT_ID('dbo.order_items', 'U') IS NULL
CREATE TABLE dbo.order_items (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  order_id   NVARCHAR(100) NOT NULL,
  game_id    INT           NOT NULL,
  price_paid DECIMAL(18,2) NOT NULL
)`,

  // ── REVIEWS ────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.reviews', 'U') IS NULL
CREATE TABLE dbo.reviews (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id    NVARCHAR(100) NOT NULL,
  game_id    INT           NOT NULL,
  rating     INT           NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title      NVARCHAR(500) NULL,
  body       NVARCHAR(MAX) NULL,
  helpful    INT           DEFAULT 0,
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (user_id, game_id)
)`,

  // ── GROUPS ─────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.groups', 'U') IS NULL
CREATE TABLE dbo.groups (
  id           NVARCHAR(100)  PRIMARY KEY,
  name         NVARCHAR(255)  NOT NULL,
  slug         NVARCHAR(255)  NOT NULL UNIQUE,
  description  NVARCHAR(MAX)  NULL,
  image        NVARCHAR(MAX)  NULL,
  owner_id     NVARCHAR(100)  NOT NULL,
  is_public    BIT            DEFAULT 1,
  member_count INT            DEFAULT 1,
  created_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,
  `IF OBJECT_ID('dbo.group_members', 'U') IS NULL
CREATE TABLE dbo.group_members (
  id        BIGINT IDENTITY(1,1) PRIMARY KEY,
  group_id  NVARCHAR(100) NOT NULL,
  user_id   NVARCHAR(100) NOT NULL,
  role      NVARCHAR(50)  DEFAULT 'member',
  joined_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (group_id, user_id)
)`,

  // ── POSTS ──────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.posts', 'U') IS NULL
CREATE TABLE dbo.posts (
  id         NVARCHAR(100)  PRIMARY KEY,
  user_id    NVARCHAR(100)  NOT NULL,
  group_id   NVARCHAR(100)  NULL,
  game_id    INT            NULL,
  title      NVARCHAR(500)  NOT NULL,
  body       NVARCHAR(MAX)  NOT NULL,
  likes      INT            DEFAULT 0,
  replies    INT            DEFAULT 0,
  pinned     BIT            DEFAULT 0,
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,
  `IF OBJECT_ID('dbo.post_replies', 'U') IS NULL
CREATE TABLE dbo.post_replies (
  id         NVARCHAR(100)  PRIMARY KEY,
  post_id    NVARCHAR(100)  NOT NULL,
  user_id    NVARCHAR(100)  NOT NULL,
  body       NVARCHAR(MAX)  NOT NULL,
  likes      INT            DEFAULT 0,
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // ── FRIENDS ────────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.friends', 'U') IS NULL
CREATE TABLE dbo.friends (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id    NVARCHAR(100) NOT NULL,
  friend_id  NVARCHAR(100) NOT NULL,
  status     NVARCHAR(50)  DEFAULT 'pending',
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (user_id, friend_id)
)`,

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.notifications', 'U') IS NULL
CREATE TABLE dbo.notifications (
  id         NVARCHAR(100)  PRIMARY KEY,
  user_id    NVARCHAR(100)  NOT NULL,
  type       NVARCHAR(100)  NOT NULL,
  title      NVARCHAR(500)  NOT NULL,
  body       NVARCHAR(MAX)  NULL,
  link       NVARCHAR(MAX)  NULL,
  [read]     BIT            DEFAULT 0,
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // ── AUDIT LOG ──────────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.audit_log', 'U') IS NULL
CREATE TABLE dbo.audit_log (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id    NVARCHAR(100) NULL,
  action     NVARCHAR(255) NOT NULL,
  target     NVARCHAR(500) NULL,
  meta       NVARCHAR(MAX) NULL,
  ip         NVARCHAR(100) NULL,
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // ── SUPPORT TICKETS ────────────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.support_tickets', 'U') IS NULL
CREATE TABLE dbo.support_tickets (
  id         NVARCHAR(100)  PRIMARY KEY,
  user_id    NVARCHAR(100)  NULL,
  email      NVARCHAR(255)  NOT NULL,
  subject    NVARCHAR(500)  NOT NULL,
  message    NVARCHAR(MAX)  NOT NULL,
  status     NVARCHAR(50)   DEFAULT 'open',
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // ── PASSWORD RESET TOKENS ──────────────────────────────────────────────────
  `IF OBJECT_ID('dbo.password_reset_tokens', 'U') IS NULL
CREATE TABLE dbo.password_reset_tokens (
  id         NVARCHAR(100)  PRIMARY KEY,
  user_id    NVARCHAR(100)  NOT NULL,
  token_hash NVARCHAR(255)  NOT NULL,
  expires_at DATETIME2      NOT NULL,
  used_at    DATETIME2      NULL,
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // ── EMAIL VERIFICATION TOKENS ──────────────────────────────────────────────
  `IF OBJECT_ID('dbo.email_verification_tokens', 'U') IS NULL
CREATE TABLE dbo.email_verification_tokens (
  id         NVARCHAR(100)  PRIMARY KEY,
  user_id    NVARCHAR(100)  NOT NULL,
  email      NVARCHAR(255)  NOT NULL,
  token_hash NVARCHAR(255)  NOT NULL,
  expires_at DATETIME2      NOT NULL,
  used_at    DATETIME2      NULL,
  created_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
)`,

  // â”€â”€ FOREIGN KEYS â€” keep hybrid SQL Server data from orphaning on deletes â”€â”€
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_sessions_users')
ALTER TABLE dbo.sessions WITH NOCHECK ADD CONSTRAINT FK_sessions_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cart_items_users')
ALTER TABLE dbo.cart_items WITH NOCHECK ADD CONSTRAINT FK_cart_items_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cart_items_games')
ALTER TABLE dbo.cart_items WITH NOCHECK ADD CONSTRAINT FK_cart_items_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wishlist_items_users')
ALTER TABLE dbo.wishlist_items WITH NOCHECK ADD CONSTRAINT FK_wishlist_items_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wishlist_items_games')
ALTER TABLE dbo.wishlist_items WITH NOCHECK ADD CONSTRAINT FK_wishlist_items_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_library_users')
ALTER TABLE dbo.library WITH NOCHECK ADD CONSTRAINT FK_library_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_library_games')
ALTER TABLE dbo.library WITH NOCHECK ADD CONSTRAINT FK_library_games FOREIGN KEY (game_id) REFERENCES dbo.games(id)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_orders_users')
ALTER TABLE dbo.orders WITH NOCHECK ADD CONSTRAINT FK_orders_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_order_items_orders')
ALTER TABLE dbo.order_items WITH NOCHECK ADD CONSTRAINT FK_order_items_orders FOREIGN KEY (order_id) REFERENCES dbo.orders(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_order_items_games')
ALTER TABLE dbo.order_items WITH NOCHECK ADD CONSTRAINT FK_order_items_games FOREIGN KEY (game_id) REFERENCES dbo.games(id)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_reviews_users')
ALTER TABLE dbo.reviews WITH NOCHECK ADD CONSTRAINT FK_reviews_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_reviews_games')
ALTER TABLE dbo.reviews WITH NOCHECK ADD CONSTRAINT FK_reviews_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_group_members_groups')
ALTER TABLE dbo.group_members WITH NOCHECK ADD CONSTRAINT FK_group_members_groups FOREIGN KEY (group_id) REFERENCES dbo.groups(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_group_members_users')
ALTER TABLE dbo.group_members WITH NOCHECK ADD CONSTRAINT FK_group_members_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_posts_users')
ALTER TABLE dbo.posts WITH NOCHECK ADD CONSTRAINT FK_posts_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_posts_groups')
ALTER TABLE dbo.posts WITH NOCHECK ADD CONSTRAINT FK_posts_groups FOREIGN KEY (group_id) REFERENCES dbo.groups(id) ON DELETE SET NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_posts_games')
ALTER TABLE dbo.posts WITH NOCHECK ADD CONSTRAINT FK_posts_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE SET NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_post_replies_posts')
ALTER TABLE dbo.post_replies WITH NOCHECK ADD CONSTRAINT FK_post_replies_posts FOREIGN KEY (post_id) REFERENCES dbo.posts(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_post_replies_users')
ALTER TABLE dbo.post_replies WITH NOCHECK ADD CONSTRAINT FK_post_replies_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_notifications_users')
ALTER TABLE dbo.notifications WITH NOCHECK ADD CONSTRAINT FK_notifications_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_audit_log_users')
ALTER TABLE dbo.audit_log WITH NOCHECK ADD CONSTRAINT FK_audit_log_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_support_tickets_users')
ALTER TABLE dbo.support_tickets WITH NOCHECK ADD CONSTRAINT FK_support_tickets_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_password_reset_tokens_users')
ALTER TABLE dbo.password_reset_tokens WITH NOCHECK ADD CONSTRAINT FK_password_reset_tokens_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_email_verification_tokens_users')
ALTER TABLE dbo.email_verification_tokens WITH NOCHECK ADD CONSTRAINT FK_email_verification_tokens_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_game_genres_games')
ALTER TABLE dbo.game_genres WITH NOCHECK ADD CONSTRAINT FK_game_genres_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_game_platforms_games')
ALTER TABLE dbo.game_platforms WITH NOCHECK ADD CONSTRAINT FK_game_platforms_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,
  `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_game_tags_games')
ALTER TABLE dbo.game_tags WITH NOCHECK ADD CONSTRAINT FK_game_tags_games FOREIGN KEY (game_id) REFERENCES dbo.games(id) ON DELETE CASCADE`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_games_title' AND object_id = OBJECT_ID('dbo.games'))
CREATE INDEX idx_games_title ON dbo.games(title)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_games_developer' AND object_id = OBJECT_ID('dbo.games'))
CREATE INDEX idx_games_developer ON dbo.games(developer)`,
];
