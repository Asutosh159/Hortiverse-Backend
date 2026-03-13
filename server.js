const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./hortiverse.sqlite', (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the HortiVerse SQLite database.");
    // 🟢 INITIALIZE SLIDER TABLE IF IT DOESN'T EXIST
    db.run(`CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      caption TEXT,
      sub_text TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    )`);
  }
});

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: "All fields are required." });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')`;
    
    db.run(sql, [full_name, email, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({ error: "An account with this email already exists." });
        }
        return res.status(500).json({ error: "Database error during registration." });
      }
      res.json({ success: true, userId: this.lastID, message: "Registration successful!" });
    });
  } catch (err) { res.status(500).json({ error: "Server error during registration." }); }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid email or password." });
    
    res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  });
});

// ==========================================
// 2. STORIES ROUTES
// ==========================================
app.get('/api/stories', (req, res) => {
  const visitorId = req.query.visitorId || '';
  const sql = `
    SELECT 
      s.*, 
      CASE WHEN l.story_id IS NOT NULL THEN 1 ELSE 0 END as has_liked
    FROM stories s
    LEFT JOIN likes l ON s.id = l.story_id AND l.visitor_id = ?
    ORDER BY s.id DESC
  `;

  db.all(sql, [visitorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/stories', (req, res) => {
  const { title, author, excerpt, content, tag, image_url, read_time } = req.body;
  if (!title || !content || !excerpt) return res.status(400).json({ error: "Missing required fields" });
  const sql = `INSERT INTO stories (title, author, excerpt, content, tag, image_url, read_time, likes, comments) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`;
  db.run(sql, [title, author, excerpt, content, tag, image_url, read_time], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

app.post('/api/stories/:id/like', (req, res) => {
  const storyId = req.params.id;
  const visitorId = req.body.visitorId;
  if (!visitorId) return res.status(400).json({ error: "Visitor ID is required" });
  db.get(`SELECT visitor_id FROM likes WHERE story_id = ? AND visitor_id = ?`, [storyId, visitorId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      db.run(`DELETE FROM likes WHERE story_id = ? AND visitor_id = ?`, [storyId, visitorId]);
      db.run(`UPDATE stories SET likes = likes - 1 WHERE id = ?`, [storyId]);
      res.json({ action: "unliked", liked: false });
    } else {
      db.run(`INSERT INTO likes (story_id, visitor_id) VALUES (?, ?)`, [storyId, visitorId]);
      db.run(`UPDATE stories SET likes = likes + 1 WHERE id = ?`, [storyId]);
      res.json({ action: "liked", liked: true });
    }
  });
});

// ==========================================
// 3. COMMENTS ROUTES
// ==========================================
app.get('/api/stories/:id/comments', (req, res) => {
  const sql = `SELECT c.*, u.full_name FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.story_id = ? ORDER BY c.created_at DESC`;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/stories/:id/comments', (req, res) => {
  const { text, guestName, userId } = req.body;
  const displayName = guestName || "Anonymous Farmer";
  const sql = "INSERT INTO comments (story_id, user_id, guest_name, comment_text) VALUES (?, ?, ?, ?)";
  db.run(sql, [req.params.id, userId || null, displayName, text], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`UPDATE stories SET comments = comments + 1 WHERE id = ?`, [req.params.id]);
    res.json({ id: this.lastID, success: true });
  });
});

// ==========================================
// 4. RESOURCES ROUTES
// ==========================================
app.get('/api/resources', (req, res) => {
  db.all("SELECT * FROM resources ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] })));
  });
});

app.post('/api/resources', (req, res) => {
  const { type, title, author, institution, year, tags, desc, drive_link } = req.body;
  const sql = `INSERT INTO resources (type, title, author, institution, year, desc, drive_link, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [type, title, author, institution, year, desc, drive_link, JSON.stringify(tags || [])], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

// ==========================================
// 5. MISC ROUTES & SLIDER
// ==========================================
app.get('/api/test', (req, res) => { res.json({ message: "Hello from the HortiVerse backend!" }); });

app.get('/api/topics', (req, res) => {
  db.all(`SELECT * FROM topics`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({ ...row, subtopics: row.subtopics ? JSON.parse(row.subtopics) : [] })));
  });
});

app.get('/api/slides', (req, res) => {
  db.all("SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY display_order ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/slides', (req, res) => {
  const { image_url, caption, sub_text } = req.body;
  const sql = `INSERT INTO hero_slides (image_url, caption, sub_text, is_active) VALUES (?, ?, ?, 1)`;
  db.run(sql, [image_url, caption || "Explore", sub_text || "HortiVerse"], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

app.get('/api/stats', async (req, res) => {
  const runQuery = (query) => new Promise((resolve, reject) => {
    db.get(query, [], (err, row) => { if (err) reject(err); else resolve(row); });
  });
  try {
    const students = await runQuery("SELECT COUNT(*) as count FROM users");
    const stories = await runQuery("SELECT COUNT(*) as count FROM stories");
    res.json({ students: students.count || 0, stories: stories.count || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/topics', (req, res) => {
  const { label, icon, color, accent, description, subtopics } = req.body;
  const sql = `INSERT INTO topics (label, icon, reads_count, color, accent, description, subtopics) VALUES (?, ?, 0, ?, ?, ?, ?)`;
  db.run(sql, [label, icon, color, accent, description, JSON.stringify(subtopics || [])], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

// ==========================================
// 6. SUPERADMIN SPECIAL PRIVILEGES
// ==========================================
app.get('/api/admin/users', (req, res) => {
  db.all("SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/admin/users/:id/promote', (req, res) => {
  db.run("UPDATE users SET role = 'admin' WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/admin/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const table = type === 'user' ? 'users' : type === 'story' ? 'stories' : type === 'topic' ? 'topics' : type === 'resource' ? 'resources' : type === 'slide' ? 'hero_slides' : null;
  if (!table) return res.status(400).json({ error: "Invalid type" });
  db.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==========================================
// 7. SUPERADMIN EDIT ROUTES
// ==========================================
app.put('/api/admin/stories/:id', (req, res) => {
  const { title, author, content } = req.body;
  db.run(`UPDATE stories SET title=?, author=?, content=? WHERE id=?`, [title, author, content, req.params.id], (err) => res.json({ success: !err }));
});

app.put('/api/admin/topics/:id', (req, res) => {
  const { label, icon, description } = req.body;
  db.run(`UPDATE topics SET label=?, icon=?, description=? WHERE id=?`, [label, icon, description, req.params.id], (err) => res.json({ success: !err }));
});

app.put('/api/admin/resources/:id', (req, res) => {
  const { title, drive_link } = req.body;
  db.run(`UPDATE resources SET title=?, drive_link=? WHERE id=?`, [title, drive_link, req.params.id], (err) => res.json({ success: !err }));
});

app.listen(PORT, () => { console.log(`🚀 Server is running on http://localhost:${PORT}`); });