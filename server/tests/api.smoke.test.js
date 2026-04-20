const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

process.env.DB_MODE = process.env.DB_MODE || 'sqlite';
process.env.DB_PRIMARY = process.env.DB_PRIMARY || 'sqlite';
process.env.DB_SYNC_ON_STARTUP = process.env.DB_SYNC_ON_STARTUP || 'false';
process.env.USE_SQL_SERVER = process.env.USE_SQL_SERVER || 'false';

const { app, seedGames } = require('../index');
const { initialize, db } = require('../db');

const unique = Date.now().toString(36);
const creds = {
  username: `smoke_${unique}`,
  email: `smoke_${unique}@example.com`,
  password: 'SmokeTest#1234',
  displayName: 'Smoke Tester',
};

let authToken = '';

test('initialize database for tests', async () => {
  await initialize();
  await seedGames();
  const row = await db.prepare('SELECT 1 as ok').get();
  assert.equal(Number(row.ok), 1);
});

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('disallowed browser origins are rejected with 403', async () => {
  const res = await request(app)
    .get('/api/health')
    .set('Origin', 'https://evil.example');
  assert.equal(res.status, 403);
  assert.match(res.body.error, /origin not allowed/i);
});

test('register and login flow works', async () => {
  const reg = await request(app).post('/api/auth/register').send(creds);
  assert.ok(reg.status === 200 || reg.status === 201);
  assert.ok(reg.body.token);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  authToken = login.body.token;
});

test('changing password rotates sessions and invalidates the old token', async () => {
  assert.ok(authToken, 'auth token should exist before password change');

  const oldToken = authToken;
  const newPassword = 'SmokeTest#5678';

  const change = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${oldToken}`)
    .send({ current_password: creds.password, new_password: newPassword });

  assert.equal(change.status, 200);
  assert.ok(change.body.token);

  const oldSession = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${oldToken}`);
  assert.equal(oldSession.status, 401);

  const newSession = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${change.body.token}`);
  assert.equal(newSession.status, 200);
  assert.equal(newSession.body.user.email, creds.email);

  const oldPasswordLogin = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: newPassword });
  assert.equal(newPasswordLogin.status, 200);
  assert.ok(newPasswordLogin.body.token);

  creds.password = newPassword;
  authToken = newPasswordLogin.body.token;
});

test('auth security endpoints return live sessions and login history', async () => {
  assert.ok(authToken, 'auth token should exist before auth security checks');

  const sessions = await request(app)
    .get('/api/auth/sessions')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(sessions.status, 200);
  assert.ok(sessions.body.current_session_id);
  assert.ok(Array.isArray(sessions.body.sessions));
  assert.ok(sessions.body.sessions.some((session) => session.current === true));

  const history = await request(app)
    .get('/api/auth/login-history')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(history.status, 200);
  assert.ok(Array.isArray(history.body.history));
  assert.ok(history.body.history.some((entry) => ['login', 'change_password', 'register'].includes(entry.action)));
});

test('cart endpoint requires auth', async () => {
  const res = await request(app).get('/api/cart');
  assert.equal(res.status, 401);
});

test('authenticated cart add and checkout works', async () => {
  if (!authToken) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ login: creds.email, password: creds.password });
    assert.equal(login.status, 200);
    authToken = login.body.token;
  }
  assert.ok(authToken, 'auth token should exist');

  const add = await request(app)
    .post('/api/cart/add')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ game_id: 21 }); // free game keeps checkout deterministic

  assert.ok(add.status === 200 || add.status === 201);

  const blockedCheckout = await request(app)
    .post('/api/cart/checkout')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ paymentMethod: 'GameGlitz Wallet' });

  assert.equal(blockedCheckout.status, 403);
  assert.equal(blockedCheckout.body.code, 'EMAIL_VERIFICATION_REQUIRED');

  await db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(creds.email);

  const checkout = await request(app)
    .post('/api/cart/checkout')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ paymentMethod: 'GameGlitz Wallet' });

  assert.equal(checkout.status, 200);
  assert.ok(checkout.body.order);
  assert.ok(checkout.body.order.id);
});

test('repeated failed logins trigger a temporary account lockout', async () => {
  const lockoutUnique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const lockoutUser = {
    username: `locked_${lockoutUnique}`,
    email: `locked_${lockoutUnique}@example.com`,
    password: 'Lockout#123',
    displayName: 'Lockout Tester',
  };

  const reg = await request(app).post('/api/auth/register').send(lockoutUser);
  assert.ok(reg.status === 200 || reg.status === 201);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: lockoutUser.email, password: 'WrongPassword#999' });
    assert.equal(res.status, 401);
  }

  const lockingAttempt = await request(app)
    .post('/api/auth/login')
    .send({ login: lockoutUser.email, password: 'WrongPassword#999' });
  assert.equal(lockingAttempt.status, 423);
  assert.ok(lockingAttempt.body.retry_after > 0);

  const lockedLogin = await request(app)
    .post('/api/auth/login')
    .send({ login: lockoutUser.email, password: lockoutUser.password });
  assert.equal(lockedLogin.status, 423);
  assert.ok(lockedLogin.body.retry_after > 0);
});

test('support endpoints work', async () => {
  const ticket = await request(app)
    .post('/api/support')
    .send({
      name: 'Smoke Tester',
      email: creds.email,
      category: 'Technical Issue / Bug',
      subject: 'Smoke test support ticket',
      message: 'This is an automated smoke test support message with enough detail.',
    });
  assert.equal(ticket.status, 200);
  assert.ok(ticket.body.ticket_id);

  const chat = await request(app)
    .post('/api/support/chat')
    .send({ message: 'I need help with billing and refund status.' });
  assert.equal(chat.status, 200);
  assert.ok(chat.body.reply);
});

test('revoked tokens are ignored on optional-auth routes', async () => {
  assert.ok(authToken, 'auth token should exist before logout');

  const logout = await request(app)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${authToken}`)
    .send({});
  assert.equal(logout.status, 200);

  const game = await request(app)
    .get('/api/games/21')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(game.status, 200);
  assert.equal(game.body.userState, null);

  authToken = '';
});

test('social accounts can delete without password confirmation', async () => {
  const socialUnique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const socialId = `social_${socialUnique}`;
  const socialEmail = `social_${socialUnique}@example.com`;
  const socialPassword = 'SocialDelete#123';

  await db.prepare(
    'INSERT INTO users (id, username, email, display_name, password_hash, social_provider) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    socialId,
    `social_${socialUnique}`,
    socialEmail,
    'Social Delete Tester',
    bcrypt.hashSync(socialPassword, 12),
    'Google'
  );

  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: socialEmail, password: socialPassword });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const deletion = await request(app)
    .delete('/api/auth/account')
    .set('Authorization', `Bearer ${login.body.token}`);
  assert.equal(deletion.status, 200);
  assert.equal(deletion.body.success, true);

  const deletedUser = await db.prepare('SELECT id FROM users WHERE id = ?').get(socialId);
  assert.equal(deletedUser, undefined);
});

test('games list returns results with pagination', async () => {
  const res = await request(app).get('/api/games?limit=5&offset=0');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.games));
  assert.ok(typeof res.body.total === 'number');
});

test('games can be filtered by genre', async () => {
  const res = await request(app).get('/api/games?genre=Action&limit=10');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.games));
});

test('game detail by slug or id returns game + related', async () => {
  const list = await request(app).get('/api/games?limit=1');
  assert.equal(list.status, 200);
  if (!list.body.games.length) return;
  const g = list.body.games[0];
  const res = await request(app).get(`/api/games/${g.slug || g.id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.game);
  assert.equal(res.body.game.id, g.id);
  assert.ok(Array.isArray(res.body.related));
});

test('wishlist requires auth', async () => {
  const res = await request(app).get('/api/wishlist');
  assert.equal(res.status, 401);
});

test('wishlist toggle works for authenticated user', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const list = await request(app).get('/api/games?limit=1');
  if (!list.body.games.length) return;
  const game = list.body.games[0];

  const toggle = await request(app)
    .post('/api/wishlist/toggle')
    .set('Authorization', `Bearer ${token}`)
    .send({ game_id: game.id });
  assert.equal(toggle.status, 200);
  assert.ok(typeof toggle.body.added === 'boolean');

  const untoggle = await request(app)
    .post('/api/wishlist/toggle')
    .set('Authorization', `Bearer ${token}`)
    .send({ game_id: game.id });
  assert.equal(untoggle.status, 200);
  assert.ok(typeof untoggle.body.added === 'boolean');
  assert.notEqual(toggle.body.added, untoggle.body.added);
});

test('review submission requires game ownership', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const list = await request(app).get('/api/games?limit=2');
  if (list.body.games.length < 2) return;
  const unownedGame = list.body.games.find(g => g.id !== 21);
  if (!unownedGame) return;

  const res = await request(app)
    .post('/api/reviews')
    .set('Authorization', `Bearer ${token}`)
    .send({ game_id: unownedGame.id, rating: 4, title: 'Good', body: 'Nice game!' });
  assert.equal(res.status, 403);
});

test('community groups list is public', async () => {
  const res = await request(app).get('/api/groups');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.groups));
});

test('creating a group requires verified email', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  const token = login.body.token;

  await db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(creds.email);

  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Test Group ${Date.now().toString(36)}`, description: 'A test group.' });
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.slug);
});

test('notifications endpoint requires auth', async () => {
  const res = await request(app).get('/api/notifications');
  assert.equal(res.status, 401);
});

test('public user profile returns user info', async () => {
  const res = await request(app).get(`/api/users/${creds.username}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.user);
  assert.equal(res.body.user.username, creds.username);
  assert.ok(!('password_hash' in res.body.user));
});

test('admin panel requires ADMIN_SECRET', async () => {
  const res = await request(app).get('/admin/stats');
  assert.equal(res.status, 503);

  process.env.ADMIN_SECRET = 'test-secret-12345';
  const authorized = await request(app)
    .get('/admin/stats')
    .set('x-admin-secret', 'test-secret-12345');
  assert.equal(authorized.status, 200);
  assert.ok(typeof authorized.body.games === 'number');

  const forbidden = await request(app)
    .get('/admin/stats')
    .set('x-admin-secret', 'wrong-secret');
  assert.equal(forbidden.status, 403);

  delete process.env.ADMIN_SECRET;
});

test('cart add rejects invalid game_id', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  const token = login.body.token;

  const res = await request(app)
    .post('/api/cart/add')
    .set('Authorization', `Bearer ${token}`)
    .send({ game_id: 'not-a-number' });
  assert.equal(res.status, 400);
});

test('cart add rejects nonexistent game', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ login: creds.email, password: creds.password });
  const token = login.body.token;

  const res = await request(app)
    .post('/api/cart/add')
    .set('Authorization', `Bearer ${token}`)
    .send({ game_id: 999999 });
  assert.equal(res.status, 404);
});

test('stats endpoint returns platform counters', async () => {
  const res = await request(app).get('/api/stats');
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.games === 'number');
  assert.ok(typeof res.body.users === 'number');
});

test('crossed friend requests are blocked cleanly', async () => {
  const friendUnique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const friendPassword = 'FriendTest#123';
  const userA = {
    username: `frienda_${friendUnique}`,
    email: `frienda_${friendUnique}@example.com`,
    password: friendPassword,
    displayName: 'Friend A',
  };
  const userB = {
    username: `friendb_${friendUnique}`,
    email: `friendb_${friendUnique}@example.com`,
    password: friendPassword,
    displayName: 'Friend B',
  };

  const regA = await request(app).post('/api/auth/register').send(userA);
  const regB = await request(app).post('/api/auth/register').send(userB);
  assert.ok(regA.body.token);
  assert.ok(regB.body.token);

  const firstRequest = await request(app)
    .post('/api/friends/request')
    .set('Authorization', `Bearer ${regA.body.token}`)
    .send({ username: userB.username });
  assert.equal(firstRequest.status, 200);

  const crossedRequest = await request(app)
    .post('/api/friends/request')
    .set('Authorization', `Bearer ${regB.body.token}`)
    .send({ username: userA.username });
  assert.equal(crossedRequest.status, 409);
  assert.match(crossedRequest.body.error, /already sent you a friend request/i);
});
