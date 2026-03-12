const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

// Initialize the Express app
const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); // Allows your React app (running on a different port) to talk to this server
app.use(express.json()); // Allows the server to understand JSON data sent from frontend forms

// Connect to SQLite Database
const db = new sqlite3.Database('./hortiverse.sqlite', (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the HortiVerse SQLite database.");
  }
});

// ==========================================
// API ROUTES (Endpoints)
// ==========================================

// 1. A simple test route just to make sure the server is alive
app.get('/api/test', (req, res) => {
  res.json({ message: "Hello from the HortiVerse backend!" });
});

// 2. Fetch all Topics for the Knowledge Hub page
app.get('/api/topics', (req, res) => {
  const sql = `SELECT * FROM topics`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Convert the stringified subtopics JSON back into an array for React
    const formattedRows = rows.map(row => {
      return {
        ...row,
        subtopics: row.subtopics ? JSON.parse(row.subtopics) : []
      };
    });
    
    res.json(formattedRows);
  });
});

// 3. Fetch Stories with total likes and comments count
app.get('/api/stories', (req, res) => {
  const visitorId = req.query.visitorId || ''; // The frontend will send the guest/user ID here
  
  const sql = `
    SELECT 
      stories.*, 
      users.full_name as author, 
      users.bio as author_bio,
      (SELECT COUNT(*) FROM likes WHERE story_id = stories.id) as likes,
      (SELECT COUNT(*) FROM comments WHERE story_id = stories.id) as comments,
      -- This checks if the current visitor has already liked this specific story
      EXISTS(SELECT 1 FROM likes WHERE story_id = stories.id AND visitor_id = ?) as has_liked
    FROM stories
    LEFT JOIN users ON stories.author_id = users.id
    ORDER BY stories.created_at DESC
  `;
  
  db.all(sql, [visitorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// 4. Route to get Hero Slides
app.get('/api/slides', (req, res) => {
  db.all("SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY display_order ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 5. Route to get Dynamic Stats
app.get('/api/stats', async (req, res) => {
  // A helper function to run multiple DB queries smoothly
  const runQuery = (query) => new Promise((resolve, reject) => {
    db.get(query, [], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });

  try {
    const students = await runQuery("SELECT COUNT(*) as count FROM users");
    const stories = await runQuery("SELECT COUNT(*) as count FROM stories");
    const countries = await runQuery("SELECT COUNT(DISTINCT country) as count FROM users WHERE country IS NOT NULL");
    const species = await runQuery("SELECT setting_value FROM platform_settings WHERE setting_key = 'total_plant_species'");

    res.json({
      // We add fallback numbers just in case the DB is totally empty during testing
      students: students.count || 2450, 
      stories: stories.count || 1200,
      countries: countries.count || 45,
      species: species ? parseInt(species.setting_value) : 12000
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// 6. Handle Liking a Story
app.post('/api/stories/:id/like', (req, res) => {
  const storyId = req.params.id;
  const { visitorId } = req.body;

  if (!visitorId) return res.status(400).json({ error: "Visitor ID is required" });

  // First, check if they already liked it
  db.get("SELECT * FROM likes WHERE story_id = ? AND visitor_id = ?", [storyId, visitorId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (row) {
      // They already liked it, so clicking again means they want to UN-LIKE it
      db.run("DELETE FROM likes WHERE story_id = ? AND visitor_id = ?", [storyId, visitorId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ action: "unliked" });
      });
    } else {
      // They haven't liked it yet, so add the like
      db.run("INSERT INTO likes (story_id, visitor_id) VALUES (?, ?)", [storyId, visitorId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ action: "liked" });
      });
    }
  });
});
// 7. Fetch all comments for a specific story
app.get('/api/stories/:id/comments', (req, res) => {
  const storyId = req.params.id;
  // We join the users table just in case a registered user left the comment
  const sql = `
    SELECT c.*, u.full_name 
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.story_id = ?
    ORDER BY c.created_at DESC
  `;
  
  db.all(sql, [storyId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 8. Post a new comment
app.post('/api/stories/:id/comments', (req, res) => {
  const storyId = req.params.id;
  const { text, guestName, userId } = req.body;

  if (!text) return res.status(400).json({ error: "Comment text is required" });

  const displayName = guestName || "Anonymous Farmer";

  const sql = "INSERT INTO comments (story_id, user_id, guest_name, comment_text) VALUES (?, ?, ?, ?)";
  db.run(sql, [storyId, userId || null, displayName, text], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});
// 9. Fetch all Resources
app.get('/api/resources', (req, res) => {
  db.all("SELECT * FROM resources ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Parse the JSON tags back into an array for React
    const formattedRows = rows.map(r => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : []
    }));
    
    res.json(formattedRows);
  });
});

// 10. Upload a new Resource
app.post('/api/resources', (req, res) => {
  const { type, title, author, institution, year, tags, desc, drive_link } = req.body;
  
  const sql = `INSERT INTO resources (type, title, author, institution, year, tags, desc, drive_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [type, title, author, institution, year, JSON.stringify(tags || []), desc, drive_link], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

// ==========================================
// START THE SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});