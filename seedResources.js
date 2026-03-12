const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./hortiverse.sqlite');

db.serialize(() => {
  // 1. Clear out the old table entirely
  db.run(`DROP TABLE IF EXISTS resources`);

  // 2. Create the fresh, empty table
  db.run(`CREATE TABLE resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, 
    title TEXT, 
    author TEXT, 
    institution TEXT,
    year INTEGER, 
    tags TEXT, 
    desc TEXT, 
    drive_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log("🧹 Resources table cleared! Your library is now empty and ready for fresh uploads.");
});

db.close();