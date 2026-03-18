require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function createAdmin() {
  const fullName = "Super Admin";
  const email = "bharat.hortiverse26@gmail.com"; 
  const password = "hvBharat@2026"; 
  const role = "admin";

  try {
    console.log("⏳ Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("🚀 Inserting Admin into Turso...");
    // 🟢 Using the exact column names from your Drizzle Studio screenshot
    const result = await db.execute({
      sql: "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      args: [fullName, email, hashedPassword, role]
    });

    console.log("✅ Admin Created Successfully!");
  } catch (err) {
    console.error("❌ DATABASE ERROR:", err.message);
    
    if (err.message.includes("no such table")) {
      console.log("💡 TIP: The 'users' table doesn't exist yet. Create it in Drizzle Studio first!");
    }
  }
}

createAdmin();