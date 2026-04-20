const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();

module.exports = function createCommunityRouter({ db, requireAuth, optionalAuth, requireVerifiedUser, auditLog }) {
  // ── Groups ────────────────────────────────────────────
  router.get('/groups', async (req, res) => {
    try {
      const { search, limit = 20, offset = 0 } = req.query;
      let q = 'SELECT g.*, u.username as owner_username FROM groups g JOIN users u ON g.owner_id = u.id WHERE g.is_public = 1';
      const p = [];
      if (search) { q += ' AND (g.name LIKE ? OR g.description LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
      q += ' ORDER BY g.member_count DESC LIMIT ? OFFSET ?';
      p.push(Math.max(1, Math.min(100, parseInt(limit) || 20)), Math.max(0, parseInt(offset) || 0));
      res.json({ groups: await db.prepare(q).all(...p) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.get('/groups/:id', optionalAuth, async (req, res) => {
    try {
      const group = await db.prepare('SELECT g.*, u.username as owner_username FROM groups g JOIN users u ON g.owner_id = u.id WHERE g.id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found.' });
      if (!group.is_public) {
        const uid = req.user?.id;
        if (!uid) return res.status(403).json({ error: 'This group is private.' });
        const isMember = await db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, uid);
        if (!isMember) return res.status(403).json({ error: 'This group is private.' });
      }
      const members = await db.prepare('SELECT gm.role, gm.joined_at, u.id, u.username, u.display_name, u.avatar_url, u.level FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = ? ORDER BY gm.role DESC').all(req.params.id);
      const posts = await db.prepare('SELECT p.*, u.username, u.display_name, u.avatar_url FROM posts p JOIN users u ON p.user_id = u.id WHERE p.group_id = ? ORDER BY p.pinned DESC, p.created_at DESC').all(req.params.id);
      res.json({ group, members, posts });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/groups', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name || name.length < 3) return res.status(400).json({ error: 'Group name must be at least 3 characters.' });
      if (name.length > 100) return res.status(400).json({ error: 'Group name must be 100 characters or fewer.' });
      if (description && String(description).length > 500) return res.status(400).json({ error: 'Group description must be 500 characters or fewer.' });
      const id = uuid(), slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `group-${Date.now().toString(36)}`;
      await db.transaction(async () => {
        await db.prepare('INSERT INTO groups (id, name, slug, description, owner_id) VALUES (?, ?, ?, ?, ?)').run(id, name, slug, description || '', req.user.id);
        await db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'owner');
        await db.prepare('UPDATE users SET xp = xp + 50 WHERE id = ?').run(req.user.id);
      })();
      res.status(201).json({ id, slug, name });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627') || err.message?.includes('2601')) return res.status(409).json({ error: 'A group with that name already exists.' });
      console.error(err); res.status(500).json({ error: 'Failed to create group.' });
    }
  });

  router.post('/groups/:id/join', requireAuth, async (req, res) => {
    try {
      const group = await db.prepare('SELECT id, is_public FROM groups WHERE id = ?').get(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found.' });
      if (!group.is_public) return res.status(403).json({ error: 'This group is private. You need an invitation.' });
      await db.transaction(async () => {
        await db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, req.user.id, 'member');
        await db.prepare('UPDATE groups SET member_count = member_count + 1 WHERE id = ?').run(req.params.id);
      })();
      await db.prepare('UPDATE users SET xp = xp + 10 WHERE id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (err) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('2627')) return res.status(400).json({ error: 'Already a member.' });
      console.error(err); res.status(500).json({ error: 'Failed.' });
    }
  });

  router.post('/groups/:id/leave', requireAuth, async (req, res) => {
    try {
      const m = await db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!m) return res.status(400).json({ error: 'Not a member.' });
      if (m.role === 'owner') return res.status(400).json({ error: 'Owners cannot leave.' });
      await db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.user.id);
      await db.prepare('UPDATE groups SET member_count = CASE WHEN member_count > 0 THEN member_count - 1 ELSE 0 END WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  // ── Posts ─────────────────────────────────────────────
  router.get('/posts', async (req, res) => {
    try {
      const { group_id, game_id, limit = 20, offset = 0 } = req.query;
      let q = 'SELECT p.*, u.username, u.display_name, u.avatar_url FROM posts p JOIN users u ON p.user_id = u.id WHERE 1=1';
      const pp = [];
      if (group_id) { q += ' AND p.group_id = ?'; pp.push(group_id); }
      if (game_id)  { q += ' AND p.game_id = ?';  pp.push(game_id); }
      q += ' ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?';
      pp.push(Math.max(1, Math.min(100, parseInt(limit) || 20)), Math.max(0, parseInt(offset) || 0));
      res.json({ posts: await db.prepare(q).all(...pp) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/posts', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const { group_id, game_id } = req.body;
      const title = String(req.body?.title || '').trim();
      const body  = String(req.body?.body  || '').trim();
      if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });
      if (title.length < 3)   return res.status(400).json({ error: 'Title must be at least 3 characters.' });
      if (body.length < 10)   return res.status(400).json({ error: 'Body must be at least 10 characters.' });
      if (group_id) {
        const member = await db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'You must be a member of the group to post.' });
      }
      const id = uuid();
      await db.prepare('INSERT INTO posts (id, user_id, group_id, game_id, title, body) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, group_id || null, game_id || null, title.slice(0, 200), body.slice(0, 5000));
      await db.prepare('UPDATE users SET xp = xp + 15 WHERE id = ?').run(req.user.id);
      res.status(201).json({ id });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.post('/posts/:id/reply', requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'Reply body required.' });
      if (body.length < 2) return res.status(400).json({ error: 'Reply must be at least 2 characters.' });
      const post = await db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found.' });
      const id = uuid();
      await db.prepare('INSERT INTO post_replies (id, post_id, user_id, body) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, body.slice(0, 2000));
      await db.prepare('UPDATE posts SET replies = replies + 1 WHERE id = ?').run(req.params.id);
      await db.prepare('UPDATE users SET xp = xp + 5 WHERE id = ?').run(req.user.id);
      res.status(201).json({ id });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  router.get('/posts/:id/replies', async (req, res) => {
    try {
      const replies = await db.prepare('SELECT r.*, u.username, u.display_name, u.avatar_url FROM post_replies r JOIN users u ON r.user_id = u.id WHERE r.post_id = ? ORDER BY r.created_at ASC').all(req.params.id);
      res.json({ replies });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
  });

  return router;
};
