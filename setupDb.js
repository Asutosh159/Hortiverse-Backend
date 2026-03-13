const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./hortiverse.sqlite');

db.serialize(() => {
  // 1. Users Table (Students, Farmers, Admins)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    country TEXT,
    user_type TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 2. User Interests (Mapping table)
  db.run(`CREATE TABLE IF NOT EXISTS user_interests (
    user_id INTEGER,
    interest TEXT NOT NULL,
    PRIMARY KEY (user_id, interest),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`);

  // 3. Topics (Knowledge Hub)
  db.run(`CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    icon TEXT NOT NULL,
    reads_count INTEGER DEFAULT 0,
    color TEXT NOT NULL,
    accent TEXT NOT NULL,
    description TEXT NOT NULL,
    subtopics TEXT -- Stored as a JSON string
  )`);

  // 4. Resources (Community Library)
  db.run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_by INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    institution TEXT,
    year INTEGER,
    desc TEXT,
    drive_link TEXT NOT NULL,
    tags TEXT, -- Stored as a JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
  )`);

  // 5. Stories (Featured Articles)
  db.run(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    author TEXT,
    excerpt TEXT,
    content TEXT,
    tag TEXT,
    image_url TEXT,
    read_time TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0
  )
`);

// 6. Likes (Tracks who liked what - supports guests!)
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    story_id INTEGER NOT NULL,
    visitor_id TEXT NOT NULL, 
    PRIMARY KEY (story_id, visitor_id),
    FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE
  )`);

 // 7. Comments (Discussion threads - supports guests!)
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    user_id INTEGER,       
    guest_name TEXT,       
    comment_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`);
  
  // 8. Hero Slides (Homepage Banners)
  db.run(`CREATE TABLE IF NOT EXISTS hero_slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    caption TEXT NOT NULL,
    sub_text TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1 -- 1 for true, 0 for false
  )`);

  // 9. Platform Settings (Global static data)
  db.run(`CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  )`);

  console.log("✅ Database and all 9 tables aligned and created successfully!");
});

db.close();