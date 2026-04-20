/**
 * GAMEGLITZ — Application bootstrap
 * Wires middleware, routes, and startup logic.
 * index.js remains the entry point and calls startServer() from here.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const path       = require('path');
const crypto     = require('crypto');
const fs         = require('fs');

const { db, initialize: initializeDb, getDbConfig, getDbStatus } = require('./db');
const sqlServer  = require('./sqlserver');
const { sendEmail } = require('./services/email');
const { authLimiter, loginLimiter, twoFactorLimiter, apiLimiter, adminLimiter, passwordResetLimiter } = require('./middleware/rate-limit');

const PORT       = process.env.PORT || 3000;
const PUBLIC_ROOT = path.join(__dirname, '..', 'public');
const STRIPE_WEBHOOK_PATH = '/api/checkout/stripe/webhook';
const dbConfig   = getDbConfig();

// ── JWT Secret ──────────────────────────────────────────
function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const legacyPath = path.join(__dirname, '.jwt-secret');
  if (fs.existsSync(legacyPath)) {
    const s = fs.readFileSync(legacyPath, 'utf8').trim();
    if (!s) throw new Error('server/.jwt-secret is empty. Set JWT_SECRET and remove the file.');
    if (process.env.NODE_ENV !== 'test') console.warn('[auth] server/.jwt-secret is deprecated. Move the secret to JWT_SECRET.');
    return s;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
  // Persist auto-generated secret so sessions survive restarts
  const autoPath = path.join(__dirname, '.jwt-secret-auto');
  if (fs.existsSync(autoPath)) {
    const s = fs.readFileSync(autoPath, 'utf8').trim();
    if (s) return s;
  }
  if (process.env.NODE_ENV !== 'test') console.warn('[auth] JWT_SECRET not set. Generating and persisting a secret for this environment.');
  const generated = crypto.randomBytes(64).toString('hex');
  try { fs.writeFileSync(autoPath, generated, 'utf8'); } catch {}
  return generated;
}
const JWT_SECRET = getJwtSecret();

// ── 2FA encryption ──────────────────────────────────────
const TFA_ENC_KEY = crypto.createHash('sha256').update('gameglitz:2fa:v1:' + JWT_SECRET).digest();
const TFA_PREFIX  = 'enc:v1:';

function encrypt2fa(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TFA_ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return TFA_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt2fa(stored) {
  if (!stored) return null;
  if (!stored.startsWith(TFA_PREFIX)) return stored; // legacy plaintext
  const buf = Buffer.from(stored.slice(TFA_PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', TFA_ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final('utf8');
}

// ── Auth middleware factory ─────────────────────────────
const jwt = require('jsonwebtoken');
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
const { v4: uuid } = require('uuid');

async function getSessionUserFromToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  const tokenHash = hashToken(token);
  const session = await db.prepare("SELECT id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')").get(tokenHash);
  if (!session) return { decoded, session: null, user: null };
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  return { decoded, session, user: user || null };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const token = header.split(' ')[1];
    const { decoded, session, user } = await getSessionUserFromToken(token);
    if (!session || !user) return res.status(401).json({ error: 'Session expired or revoked. Please log in again.' });
    req.user = user;
    req.auth = { claims: decoded, sessionId: session.id };
    req._rawToken = token;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Invalid or expired token.' });
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      const { decoded, session, user } = await getSessionUserFromToken(token);
      if (session && user) { req.user = user; req.auth = { claims: decoded, sessionId: session.id }; req._rawToken = token; }
    } catch {}
  }
  next();
}

function requireVerifiedUser(req, res, next) {
  if (Number(req.user?.is_verified) === 1) return next();
  return res.status(403).json({ error: 'Please verify your email before using this feature.', code: 'EMAIL_VERIFICATION_REQUIRED' });
}

async function createSession(user, req, { rememberMe = false } = {}) {
  const expiry = rememberMe ? '30d' : '7d';
  const expiryMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const sessionId = uuid();
  const token = jwt.sign({ id: user.id, username: user.username, email: user.email, sid: sessionId }, JWT_SECRET, { expiresIn: expiry });
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, token_hash, device, ip, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(sessionId, user.id, tokenHash, (req.headers['user-agent'] || 'Unknown').slice(0, 100), req.ip, expiresAt);
  await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  return token;
}

function safe(user) {
  if (!user) return null;
  const { password_hash, tfa_secret, failed_login_count, locked_until, is_admin, ...rest } = user;
  return rest;
}

async function auditLog(action, { userId = null, target = null, meta = null, ip = null } = {}) {
  try {
    let metaStr = null;
    if (meta !== null && meta !== undefined) metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
    await db.prepare('INSERT INTO audit_log (user_id, action, target, meta, ip) VALUES (?, ?, ?, ?, ?)').run(userId, action, target, metaStr, ip);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('auditLog failed:', err.message);
  }
}

function baseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function verifyEmailDeliverable(email) {
  const key = process.env.ZEROBOUNCE_API_KEY;
  if (!key) return { ok: true, skipped: true };
  try {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json();
    const status = (data && data.status) || 'unknown';
    const bad = ['invalid', 'abuse', 'spamtrap', 'do_not_mail'];
    if (bad.includes(status)) return { ok: false, status, reason: data.sub_status || status };
    return { ok: true, status };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('ZeroBounce check failed:', err.message);
    return { ok: true, error: err.message };
  }
}

// ── CORS config ─────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()).filter(Boolean);
const ALLOW_DEV_LOOPBACK = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOOPBACK_ORIGINS !== 'false';
const ALLOW_DEV_FILE    = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_FILE_ORIGIN !== 'false';
const LOOPBACK_HOSTS    = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const CORS_BLOCKED_CODE = 'CORS_ORIGIN_BLOCKED';

function parseOrigin(v) { try { return new URL(v); } catch { return null; } }
function isLoopbackOrigin(v) { const p = parseOrigin(v); return !!p && LOOPBACK_HOSTS.has(p.hostname.toLowerCase()); }
function isAllowedBrowserOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOW_DEV_FILE && origin === 'null') return true;
  return ALLOW_DEV_LOOPBACK && isLoopbackOrigin(origin);
}
function refererMatchesAllowedOrigin(referer, host) {
  if (!referer) return false;
  if (ALLOW_DEV_LOOPBACK && isLoopbackOrigin(referer)) return true;
  return ALLOWED_ORIGINS.some(o => referer === o || referer.startsWith(o + '/')) || referer === host || referer.startsWith(host + '/');
}
function buildConnectSrc() {
  const s = new Set(["'self'", ...ALLOWED_ORIGINS]);
  if (ALLOW_DEV_LOOPBACK) ['http','https','ws','wss'].forEach(proto => ['localhost:*','127.0.0.1:*','[::1]:*'].forEach(h => s.add(`${proto}://${h}`)));
  return Array.from(s);
}

// ── Express app ─────────────────────────────────────────
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'none'"],
      styleSrcAttr:  ["'none'"],
      styleSrc:      ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc:        ["'self'", "data:", "https:", "blob:"],
      mediaSrc:      ["'self'", "https://www.youtube.com", "https://player.vimeo.com"],
      connectSrc:    buildConnectSrc(),
      frameSrc:      ["'self'", "https://www.youtube.com", "https://player.vimeo.com"],
      frameAncestors:["'self'"],
      objectSrc:     ["'none'"],
      baseUri:       ["'self'"],
      formAction:    ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  next();
});

// Block server internals
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (p === '/server' || p.startsWith('/server/') || p.endsWith('.db') || p.endsWith('.db-shm') || p.endsWith('.db-wal') || p.endsWith('.bak') || p.endsWith('.env') || p.includes('/.env') || p.includes('/node_modules/')) return res.status(403).end('Forbidden');
  next();
});

app.use(cors({
  origin: (origin, cb) => isAllowedBrowserOrigin(origin) ? cb(null, true) : cb(Object.assign(new Error('CORS: origin not allowed'), { status: 403, code: CORS_BLOCKED_CODE })),
  credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
app.use(compression());

const jsonParser = express.json({ limit: '2mb' });
app.use((req, res, next) => { if (req.path === STRIPE_WEBHOOK_PATH) return next(); return jsonParser(req, res, next); });

// CSRF origin enforcement
const CSRF_SAFE = new Set(['GET','HEAD','OPTIONS']);
const CSRF_EXEMPT = new Set([STRIPE_WEBHOOK_PATH, '/api/auth/google/callback', '/api/auth/discord/callback', '/api/auth/steam/callback']);
app.use((req, res, next) => {
  if (CSRF_SAFE.has(req.method) || !req.path.startsWith('/api/') || CSRF_EXEMPT.has(req.path)) return next();
  const origin = req.headers.origin || '', referer = req.headers.referer || '';
  if (!origin && !referer) return next();
  const host = `${req.protocol}://${req.get('host')}`;
  if ((origin && (origin === host || isAllowedBrowserOrigin(origin))) || refererMatchesAllowedOrigin(referer, host)) return next();
  if (process.env.NODE_ENV !== 'production') console.warn(`[CSRF] blocked ${req.method} ${req.path}`);
  res.status(403).json({ error: 'CSRF: cross-origin request blocked.' });
});

// WebP auto-serve
app.use((req, res, next) => {
  try {
    if (!(req.headers['accept'] || '').includes('image/webp')) return next();
    const m = req.path.match(/^(.*)\.(jpe?g|png)$/i);
    if (!m) return next();
    const webpAbs = path.join(PUBLIC_ROOT, m[1] + '.webp');
    if (fs.existsSync(webpAbs)) { res.setHeader('Vary', 'Accept'); req.url = m[1] + '.webp' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); }
  } catch {}
  next();
});

// Static files
app.use(express.static(PUBLIC_ROOT, {
  fallthrough: true,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.css','.js','.woff','.woff2','.ttf','.svg','.ico'].includes(ext)) res.setHeader('Cache-Control','public,max-age=86400,stale-while-revalidate=604800');
    else if (ext === '.html') res.setHeader('Cache-Control','no-cache,must-revalidate');
    else if (['.jpg','.jpeg','.png','.webp','.gif','.avif'].includes(ext)) res.setHeader('Cache-Control','public,max-age=604800');
    else res.setHeader('Cache-Control','public,max-age=3600');
  },
}));

app.use('/api/', apiLimiter);

// Async wrapper
function ah(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

// ── Mount route modules ─────────────────────────────────
const ctx = { db, requireAuth, optionalAuth, requireVerifiedUser, createSession, safe, hashToken, sendEmail, auditLog, baseUrl, encrypt2fa, decrypt2fa, verifyEmailDeliverable, authLimiter, loginLimiter, twoFactorLimiter, passwordResetLimiter, adminLimiter, getDbStatus, sqlServer, dbConfig, jwtSecret: JWT_SECRET };

const createAuthRouter      = require('./routes/auth');
const createGamesRouter     = require('./routes/games');
const createCartRouter      = require('./routes/cart');
const createStripeRouter    = require('./routes/stripe');
const createCommunityRouter = require('./routes/community');
const createMiscRouter      = require('./routes/misc');
const createAdminRouter     = require('./routes/admin');

app.use('/api/auth',     createAuthRouter(ctx));
app.use('/api/games',    createGamesRouter(ctx));
app.use('/api/cart',     createCartRouter(ctx));
app.use('/api/checkout/stripe', createStripeRouter(ctx));
app.use('/api',          createCommunityRouter(ctx));
app.use('/api',          createMiscRouter(ctx));
app.use('/admin',        createAdminRouter(ctx));

// Stripe checkout pages
app.get('/checkout/success', (req, res) => {
  const rawSid = String(req.query.session_id || '').slice(0, 128);
  const sid = /^cs_(test|live)_[A-Za-z0-9_]+$/.test(rawSid) ? rawSid : '';
  const reference = sid ? `<p class="checkout-result__ref">Payment reference: ${htmlEscape(sid)}</p>` : '';
  res.type('html').send(`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment successful - GameGlitz</title><link rel="stylesheet" href="/css/pages/checkout-result.css"></head><body><main class="checkout-result"><div class="checkout-result__icon" aria-hidden="true">OK</div><h1>Payment successful</h1><p>Your games will appear in your library shortly.</p>${reference}<a href="/account.html">Go to your library</a></main></body></html>`);
});
app.get('/checkout/cancelled', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled - GameGlitz</title><link rel="stylesheet" href="/css/pages/checkout-result.css"></head><body><main class="checkout-result"><div class="checkout-result__icon checkout-result__icon--warn" aria-hidden="true">!</div><h1>Payment cancelled</h1><p>No charge was made. Your cart is still saved.</p><a href="/store.html">Back to the store</a></main></body></html>`);
});

// SQL Server test
app.get('/api/sqlserver/test', requireDiagnosticAdmin, async (req, res) => {
  if (!dbConfig.usesSqlServer) return res.status(400).json({ error: 'SQL Server not enabled.' });
  try { const r = await sqlServer.testConnection(); res.json({ ok: true, result: r }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Game detail SSR
const gameTemplateCache = { html: null, mtime: 0 };
function loadGameTemplate() {
  const tplPath = path.join(PUBLIC_ROOT, 'game.html');
  try {
    const stat = fs.statSync(tplPath);
    if (!gameTemplateCache.html || stat.mtimeMs !== gameTemplateCache.mtime) {
      gameTemplateCache.html = fs.readFileSync(tplPath, 'utf8');
      gameTemplateCache.mtime = stat.mtimeMs;
    }
  } catch { return null; }
  return gameTemplateCache.html;
}
function htmlEscape(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


function secretEquals(candidate, expected) {
  const a = Buffer.from(String(candidate || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDiagnosticAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Diagnostics are not configured (ADMIN_SECRET not set).' });
  const auth = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const header = req.headers['x-admin-secret'] || auth?.[1];
  if (!header || !secretEquals(header, secret)) return res.status(403).json({ error: 'Forbidden.' });
  next();
}

function effectivePrice(game) {
  if (!game) return 0;
  return (game.sale_price !== null && game.sale_price !== undefined) ? Number(game.sale_price) : Number(game.price || 0);
}

app.get(['/game/:slug', '/game/:slug/'], ah(async (req, res, next) => {
  const slug = req.params.slug;
  const template = loadGameTemplate();
  if (!template) return next();
  const game = await db.prepare('SELECT * FROM games WHERE slug = ? OR id = ?').get(slug, slug);
  const canonical = `${req.protocol}://${req.get('host')}/game/${encodeURIComponent(slug)}`;
  let title, description, image, priceStr, jsonLd;
  if (game) {
    const eff = effectivePrice(game);
    title = `${game.title} — Buy on GameGlitz`;
    description = (game.description || `Buy ${game.title} on GameGlitz.`).slice(0, 180);
    image = game.image ? (game.image.startsWith('http') ? game.image : `${req.protocol}://${req.get('host')}/${game.image.replace(/^\//,'')}`) : `${req.protocol}://${req.get('host')}/images/og-cover.png`;
    priceStr = eff === 0 ? '0.00' : Number(eff).toFixed(2);
    jsonLd = { '@context':'https://schema.org', '@type':'Product', name: game.title, description, image, brand: { '@type':'Brand', name: game.developer || game.publisher || 'Unknown' }, aggregateRating: game.reviews ? { '@type':'AggregateRating', ratingValue: Number(game.rating||0).toFixed(1), reviewCount: game.reviews } : undefined, offers: { '@type':'Offer', url: canonical, priceCurrency:'USD', price: priceStr, availability:'https://schema.org/InStock' } };
  } else {
    title = 'Game not found — GameGlitz'; description = 'This game could not be found on GameGlitz.';
    image = `${req.protocol}://${req.get('host')}/images/og-cover.png`;
    jsonLd = { '@context':'https://schema.org', '@type':'WebPage', name: title };
    res.status(404);
  }
  let html = template;
  html = html.replace(/<title\s+data-ssr="title">[^<]*<\/title>/, `<title data-ssr="title">${htmlEscape(title)}</title>`);
  html = html.replace(/(<meta\s+name="description"\s+data-ssr="description"\s+content=")[^"]*"/, `$1${htmlEscape(description)}"`);
  html = html.replace(/(<link\s+rel="canonical"\s+data-ssr="canonical"\s+href=")[^"]*"/, `$1${htmlEscape(canonical)}"`);
  html = html.replace(/(<meta\s+property="og:title"\s+data-ssr="og:title"\s+content=")[^"]*"/, `$1${htmlEscape(title)}"`);
  html = html.replace(/(<meta\s+property="og:description"\s+data-ssr="og:description"\s+content=")[^"]*"/, `$1${htmlEscape(description)}"`);
  html = html.replace(/(<meta\s+property="og:image"\s+data-ssr="og:image"\s+content=")[^"]*"/, `$1${htmlEscape(image)}"`);
  html = html.replace(/(<meta\s+property="og:url"\s+data-ssr="og:url"\s+content=")[^"]*"/, `$1${htmlEscape(canonical)}"`);
  html = html.replace(/(<meta\s+name="twitter:title"\s+data-ssr="twitter:title"\s+content=")[^"]*"/, `$1${htmlEscape(title)}"`);
  html = html.replace(/(<meta\s+name="twitter:description"\s+data-ssr="twitter:description"\s+content=")[^"]*"/, `$1${htmlEscape(description)}"`);
  html = html.replace(/(<meta\s+name="twitter:image"\s+data-ssr="twitter:image"\s+content=")[^"]*"/, `$1${htmlEscape(image)}"`);
  html = html.replace(/<script\s+type="application\/ld\+json"\s+data-ssr="jsonld">[^<]*<\/script>/, `<script type="application/ld+json" data-ssr="jsonld">${JSON.stringify(jsonLd).replace(/</g,'\\u003c')}</script>`);
  res.setHeader('Content-Type','text/html; charset=utf-8').setHeader('Cache-Control','public,max-age=60');
  res.send(html);
}));

// Favicon fallback
app.get('/favicon.ico', (req, res) => {
  const icoPath = path.join(PUBLIC_ROOT, 'favicon.ico');
  if (fs.existsSync(icoPath)) return res.sendFile(icoPath);
  const ico = Buffer.from('000001000100101000000100200068040000160000002800000010000000200000000100200000000000400400000000000000000000000000000000000000','hex');
  res.set('Content-Type','image/x-icon').set('Cache-Control','public,max-age=604800').send(ico);
});

// Catch-all
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  const relPath = req.path.replace(/^\/+/, '');
  const fpPublic = path.join(PUBLIC_ROOT, relPath);
  if (fs.existsSync(fpPublic) && !fs.statSync(fpPublic).isDirectory()) return res.sendFile(fpPublic);
  res.status(404).sendFile(path.join(PUBLIC_ROOT, '404.html'));
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return;
  if (err.code === CORS_BLOCKED_CODE) return res.status(403).json({ error: 'CORS: origin not allowed.' });
  console.error('Unhandled route error:', err);
  const status = err.status || err.statusCode || 500;
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON in request body.' });
  if (status >= 400 && status < 500) return res.status(status).json({ error: err.expose ? err.message : 'Bad request.' });
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// ── Seeds & startup ─────────────────────────────────────
async function seedGames() {
  const row = await db.prepare('SELECT COUNT(*) as c FROM games').get();
  if (row.c > 0) return;
  console.log('Seeding game database...');
  const dbPath = fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'game-database.js'))
    ? path.join(__dirname, '..', 'public', 'js', 'game-database.js')
    : path.join(__dirname, '..', 'js', 'game-database.js');
  if (!fs.existsSync(dbPath)) { console.warn('game-database.js not found.'); return; }
  const content = fs.readFileSync(dbPath, 'utf-8');
  const match = content.match(/const GAME_DATABASE\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) { console.warn('Could not parse GAME_DATABASE.'); return; }
  let games;
  try { const vm = require('vm'); games = vm.runInNewContext('(' + match[1] + ')'); }
  catch (e) { console.warn('Parse failed:', e.message); return; }
  for (const g of games) {
    try {
      await db.prepare('INSERT INTO games (id, title, slug, price, sale_price, image, genre, platform, rating, reviews, developer, publisher, release_date, description, tags, size, featured, trending, new_release, free_to_play) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(g.id, g.title, g.slug, g.price, g.salePrice || null, g.image, JSON.stringify(g.genre), JSON.stringify(g.platform), g.rating, g.reviews || 0, g.developer, g.publisher, g.releaseDate, g.description, JSON.stringify(g.tags), g.size || null, g.featured ? 1 : 0, g.trending ? 1 : 0, g.newRelease ? 1 : 0, g.freeToPlay ? 1 : 0);
      for (const genre of (g.genre || [])) await db.prepare('INSERT OR IGNORE INTO game_genres (game_id, genre) VALUES (?, ?)').run(g.id, genre);
      for (const platform of (g.platform || [])) await db.prepare('INSERT OR IGNORE INTO game_platforms (game_id, platform) VALUES (?, ?)').run(g.id, platform);
      for (const tag of (g.tags || [])) await db.prepare('INSERT OR IGNORE INTO game_tags (game_id, tag) VALUES (?, ?)').run(g.id, tag);
    } catch {}
  }
  console.log(`Seeded ${games.length} games.`);
}

function describeDbMode() {
  if (dbConfig.mode === 'hybrid') return `Hybrid (${dbConfig.primary} primary, ${dbConfig.secondary} mirror)`;
  return dbConfig.mode === 'sqlserver' ? 'SQL Server' : 'SQLite (default)';
}

let sessionCleanupTimer = null;
function ensureSessionCleanupTimer() {
  if (sessionCleanupTimer) return;
  sessionCleanupTimer = setInterval(async () => {
    try { await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(); } catch {}
  }, 3600000);
  if (typeof sessionCleanupTimer.unref === 'function') sessionCleanupTimer.unref();
}

async function startServer(port = Number(process.env.PORT || PORT)) {
  console.log('  Starting GameGlitz server...');
  console.log(`  DB mode : ${describeDbMode()}`);
  await initializeDb();
  await seedGames();
  ensureSessionCleanupTimer();
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, () => resolve(instance));
    instance.once('error', reject);
  });
  console.log(`\n  GameGlitz Server ready -> http://localhost:${port}`);
  console.log(`  Health check          -> http://localhost:${port}/api/health\n`);
  return server;
}

module.exports = { app, startServer };
