require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// TURSO CLOUD CONNECTION
// ==========================================
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize Tables (Runs on start)
async function initDb() {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      caption TEXT,
      sub_text TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    )`);
    console.log("✅ Connected to Turso Cloud & Verified Tables.");
  } catch (err) {
    console.error("❌ Turso Init Error:", err.message);
  }
}
initDb();

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: "All fields are required." });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')`;
    
    const result = await db.execute({
      sql,
      args: [full_name, email, hashedPassword]
    });
    
    res.json({ success: true, userId: Number(result.lastInsertRowid), message: "Registration successful!" });
  } catch (err) { 
    if (err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    res.status(500).json({ error: "Server error during registration." }); 
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  try {
    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [email]
    });
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid email or password." });
    
    res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: "Database error." }); }
});

// ==========================================
// 2. STORIES ROUTES
// ==========================================
app.get('/api/stories', async (req, res) => {
  const visitorId = req.query.visitorId || '';
  const sql = `
    SELECT 
      s.*, 
      CASE WHEN l.story_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
    FROM stories s
    LEFT JOIN likes l ON s.id = l.story_id AND l.visitor_id = ?
    ORDER BY s.id DESC
  `;

  try {
    const result = await db.execute({ sql, args: [visitorId] });
    res.json(result.rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stories', async (req, res) => {
  const { title, author, excerpt, content, tag, image_url, read_time } = req.body;
  if (!title || !content || !excerpt) return res.status(400).json({ error: "Missing required fields" });
  
  const sql = `INSERT INTO stories (title, author, excerpt, content, tag, image_url, read_time, likes, comments) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`;
  try {
    const result = await db.execute({
      sql,
      args: [title, author, excerpt, content, tag, image_url, read_time]
    });
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stories/:id/like', async (req, res) => {
  const storyId = req.params.id;
  const visitorId = req.body.visitorId;
  if (!visitorId) return res.status(400).json({ error: "Visitor ID is required" });

  try {
    const check = await db.execute({
      sql: `SELECT visitor_id FROM likes WHERE story_id = ? AND visitor_id = ?`,
      args: [storyId, visitorId]
    });

    if (check.rows.length > 0) {
      await db.execute({ sql: `DELETE FROM likes WHERE story_id = ? AND visitor_id = ?`, args: [storyId, visitorId] });
      await db.execute({ sql: `UPDATE stories SET likes = likes - 1 WHERE id = ?`, args: [storyId] });
      res.json({ action: "unliked", liked: false });
    } else {
      await db.execute({ sql: `INSERT INTO likes (story_id, visitor_id) VALUES (?, ?)`, args: [storyId, visitorId] });
      await db.execute({ sql: `UPDATE stories SET likes = likes + 1 WHERE id = ?`, args: [storyId] });
      res.json({ action: "liked", liked: true });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. COMMENTS ROUTES
// ==========================================
app.get('/api/stories/:id/comments', async (req, res) => {
  const sql = `SELECT c.*, u.full_name FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.story_id = ? ORDER BY c.created_at DESC`;
  try {
    const result = await db.execute({ sql, args: [req.params.id] });
    res.json(result.rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stories/:id/comments', async (req, res) => {
  const { text, guestName, userId } = req.body;
  const displayName = guestName || "Anonymous Farmer";
  const sql = "INSERT INTO comments (story_id, user_id, guest_name, comment_text) VALUES (?, ?, ?, ?)";
  try {
    const result = await db.execute({
      sql,
      args: [req.params.id, userId || null, displayName, text]
    });
    await db.execute({ sql: `UPDATE stories SET comments = comments + 1 WHERE id = ?`, args: [req.params.id] });
    res.json({ id: Number(result.lastInsertRowid), success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. RESOURCES ROUTES
// ==========================================
app.get('/api/resources', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM resources ORDER BY created_at DESC");
    res.json(result.rows.map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/resources', async (req, res) => {
  const { type, title, author, institution, year, tags, desc, drive_link } = req.body;
  const sql = `INSERT INTO resources (type, title, author, institution, year, desc, drive_link, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  try {
    const result = await db.execute({
      sql,
      args: [type, title, author, institution, year, desc, drive_link, JSON.stringify(tags || [])]
    });
    res.json({ id: Number(result.lastInsertRowid), success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 5. MISC ROUTES & SLIDER
// ==========================================
app.get('/api/test', (req, res) => { res.json({ message: "Hello from the HortiVerse backend!" }); });

app.get('/api/topics', async (req, res) => {
  try {
    const result = await db.execute(`SELECT * FROM topics`);
    res.json(result.rows.map(row => ({ ...row, subtopics: row.subtopics ? JSON.parse(row.subtopics) : [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/slides', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY display_order ASC");
    res.json(result.rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/slides', async (req, res) => {
  const { image_url, caption, sub_text } = req.body;
  const sql = `INSERT INTO hero_slides (image_url, caption, sub_text, is_active) VALUES (?, ?, ?, 1)`;
  try {
    const result = await db.execute({ sql, args: [image_url, caption || "Explore", sub_text || "HortiVerse"] });
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const students = await db.execute("SELECT COUNT(*) as count FROM users");
    const stories = await db.execute("SELECT COUNT(*) as count FROM stories");
    res.json({ students: students.rows[0].count || 0, stories: stories.rows[0].count || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/topics', async (req, res) => {
  const { label, icon, color, accent, description, subtopics } = req.body;
  const sql = `INSERT INTO topics (label, icon, reads_count, color, accent, description, subtopics) VALUES (?, ?, 0, ?, ?, ?, ?)`;
  try {
    const result = await db.execute({
      sql,
      args: [label, icon, color, accent, description, JSON.stringify(subtopics || [])]
    });
    res.json({ id: Number(result.lastInsertRowid), success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 6. SUPERADMIN SPECIAL PRIVILEGES
// ==========================================
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await db.execute("SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC");
    res.json(result.rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/promote', async (req, res) => {
  try {
    await db.execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const tableMap = { user: 'users', story: 'stories', topic: 'topics', resource: 'resources', slide: 'hero_slides' };
  const table = tableMap[type];
  if (!table) return res.status(400).json({ error: "Invalid type" });
  try {
    await db.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 7. SUPERADMIN EDIT ROUTES
// ==========================================
app.put('/api/admin/stories/:id', async (req, res) => {
  const { title, author, content } = req.body;
  try {
    await db.execute({ sql: `UPDATE stories SET title=?, author=?, content=? WHERE id=?`, args: [title, author, content, req.params.id] });
    res.json({ success: true });
  } catch (err) { res.json({ success: false }); }
});

app.put('/api/admin/topics/:id', async (req, res) => {
  const { label, icon, description } = req.body;
  try {
    await db.execute({ sql: `UPDATE topics SET label=?, icon=?, description=? WHERE id=?`, args: [label, icon, description, req.params.id] });
    res.json({ success: true });
  } catch (err) { res.json({ success: false }); }
});

app.put('/api/admin/resources/:id', async (req, res) => {
  const { title, drive_link } = req.body;
  try {
    await db.execute({ sql: `UPDATE resources SET title=?, drive_link=? WHERE id=?`, args: [title, drive_link, req.params.id] });
    res.json({ success: true });
  } catch (err) { res.json({ success: false }); }
});

app.listen(PORT, () => { console.log(`🚀 Server is running on http://localhost:${PORT}`); });