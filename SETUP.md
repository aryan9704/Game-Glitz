# GameGlitz — Setup Guide

## What You Get

A gaming store backend with:

- **Real authentication** — bcrypt password hashing, JWT sessions, session tracking
- **Real 2FA** — TOTP (Time-based One-Time Password) compatible with Google Authenticator, Authy, Microsoft Authenticator
- **SQLite database** — all user data, cart, wishlist, library, orders, reviews, community persisted to disk
- **100-game catalog** automatically seeded from your existing game-database.js
- **Cart + Checkout** — with wallet balance, order history, auto-add to library
- **Wishlist** — toggle on/off, persisted per user
- **Community** — create/join groups, post discussions, reply threads
- **Friends** — send requests, accept, list
- **Reviews** — rate owned games, updates game averages
- **Notifications** — welcome, order, friend request notifications
- **XP/Leveling** — earn XP from purchases, reviews, posts, wishlisting
- **Rate limiting** — prevents brute force on login/register
- **CSP + Helmet** — security headers
- **$500 demo balance** per new account for testing purchases

---

## Prerequisites

1. **Node.js 18+** — download from https://nodejs.org
2. **npm** — comes with Node.js
3. **Python 3** + **C++ build tools** — required for better-sqlite3 compilation
   - **Windows:** `npm install --global windows-build-tools` (run as admin)
   - **macOS:** `xcode-select --install`
   - **Linux:** `sudo apt-get install build-essential python3`

---

## Quick Start

```bash
# 1. Navigate to the server directory
cd server

# 2. Install dependencies
npm install

# 3. Copy the environment template and configure it
cp .env.example .env
# Open .env and set JWT_SECRET (see the file for instructions)

# 4. Start the server
npm start

# 5. Open in browser
# → http://localhost:3000
```

The server will:
- Create `gameglitz.db` (SQLite database file) automatically
- Seed all games from `js/game-database.js` on first run
- Serve your static frontend files
- Handle all API requests

---

## Database Seeding & Reset

```bash
# From project root — seed games only (safe, skips if games already exist)
node server/reseed.js

# Force re-seed games without touching user accounts
node server/reseed.js --games

# Full reset: wipe database, recreate schema, re-seed games
# WARNING: deletes all user accounts, orders, sessions
node server/reseed.js --reset
```

A timestamped backup is written before `--reset` deletes the database.

---

## Switching Frontend to API Mode

Your site currently uses `js/state.js` (in-memory, demo mode). To use the real backend:

**In every HTML file**, replace:
```html
<script src="js/state.js"></script>
```
with:
```html
<script src="js/api-client.js"></script>
```

Or do it in one command:
```bash
# From the project root (not server/)
# macOS/Linux:
sed -i '' 's|js/state.js|js/api-client.js|g' *.html

# Linux only:
sed -i 's|js/state.js|js/api-client.js|g' *.html
```

---

## API Reference

### Auth
| Method | Endpoint | Body | Auth Required |
|--------|----------|------|---------------|
| POST | `/api/auth/register` | `{username, email, password, displayName}` | No |
| POST | `/api/auth/login` | `{login, password}` | No |
| POST | `/api/auth/verify-2fa` | `{temp_token, code}` | No |
| POST | `/api/auth/setup-2fa` | — | Yes |
| POST | `/api/auth/confirm-2fa` | `{code}` | Yes |
| POST | `/api/auth/disable-2fa` | `{code}` | Yes |
| GET | `/api/auth/me` | — | Yes |
| PATCH | `/api/auth/profile` | `{display_name?, bio?, avatar_url?}` | Yes |
| POST | `/api/auth/change-password` | `{current_password, new_password}` | Yes |
| POST | `/api/auth/logout` | — | Yes |
| POST | `/api/auth/logout-all` | — | Yes |
| DELETE | `/api/auth/account` | `{password}` | Yes |

### Support
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| POST | `/api/support` | `{name, email, category, subject, message}` | Optional |

### Health
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/health` | No |

### Games
| Method | Endpoint | Params | Auth |
|--------|----------|--------|------|
| GET | `/api/games` | `?search=&genre=&platform=&price=&sort=&featured=1&trending=1&free=1&limit=50&offset=0` | No |
| GET | `/api/games/:idOrSlug` | — | Optional |

### Cart
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| GET | `/api/cart` | — | Yes |
| POST | `/api/cart/add` | `{game_id}` | Yes |
| DELETE | `/api/cart/:gameId` | — | Yes |
| DELETE | `/api/cart` | — | Yes (clear all) |
| POST | `/api/cart/checkout` | — | Yes |

### Wishlist
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| GET | `/api/wishlist` | — | Yes |
| POST | `/api/wishlist/toggle` | `{game_id}` | Yes |

### Library / Orders / Reviews
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| GET | `/api/library` | — | Yes |
| PATCH | `/api/library/:gameId` | `{installed?, play_time?}` | Yes |
| GET | `/api/orders` | — | Yes |
| POST | `/api/reviews` | `{game_id, rating, title?, body?}` | Yes |

### Community
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| GET | `/api/groups` | `?search=` | No |
| POST | `/api/groups` | `{name, description}` | Yes |
| POST | `/api/groups/:id/join` | — | Yes |
| POST | `/api/groups/:id/leave` | — | Yes |
| GET | `/api/posts` | `?group_id=&game_id=` | No |
| POST | `/api/posts` | `{title, body, group_id?, game_id?}` | Yes |
| POST | `/api/posts/:id/reply` | `{body}` | Yes |
| GET | `/api/posts/:id/replies` | — | No |

### Friends / Notifications
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| GET | `/api/friends` | — | Yes |
| POST | `/api/friends/request` | `{username}` | Yes |
| POST | `/api/friends/accept` | `{user_id}` | Yes |
| GET | `/api/notifications` | — | Yes |
| POST | `/api/notifications/read` | `{ids: [...] or 'all'}` | Yes |

---

## 2FA Flow

1. User logs in normally → gets full JWT token
2. User goes to Settings → clicks "Enable 2FA"
3. Frontend calls `POST /api/auth/setup-2fa` → gets QR code data URL
4. User scans QR with Google Authenticator / Authy
5. User enters the 6-digit code → `POST /api/auth/confirm-2fa`
6. 2FA is now active

**Next login with 2FA enabled:**
1. User enters email + password → `POST /api/auth/login`
2. Server returns `{ tfa_required: true, temp_token: "..." }` (5-minute expiry)
3. Frontend shows 2FA code input
4. User enters code → `POST /api/auth/verify-2fa` with temp_token + code
5. Server validates TOTP → returns full JWT token

---

## Deploying to Production

For a real production deployment, you'll need:

1. **Hosting** — Railway, Render, DigitalOcean, AWS, or Vercel (for the API)
2. **Domain + SSL** — required for secure cookies and HTTPS
3. **Environment variables:**
   ```
   PORT=3000
   JWT_SECRET=your-64-char-random-secret
   NODE_ENV=production
   ```
4. **Payment processing** — integrate Stripe or PayPal to replace the demo wallet
5. **Email service** — SendGrid, SES, or Resend for verification emails
6. **Image CDN** — Cloudflare Images, imgix, or Cloudinary for game images
7. **Backups** — automate SQLite DB backups (it's a single file: `gameglitz.db`)

---

## What This Does NOT Include (Yet)

These require external services and significant additional work:

- **Real payment processing** (Stripe/PayPal integration)
- **Email verification** (needs email service like SendGrid)
- **Game file delivery** (needs CDN + file storage)
- **Real-time chat** (needs WebSocket server)
- **Image upload** (needs cloud storage like S3)
- **Admin dashboard** (content management)
- **Analytics** (tracking, metrics)
- **CDN** (for serving images/assets at scale)

Each of these is a separate engineering effort. This backend gives you the **foundation** that all of them build on.
