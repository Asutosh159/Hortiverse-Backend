const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createClient } = require('@libsql/client');
require('dotenv').config();

async function migrateDatabase() {
  console.log("🚀 Starting database migration...");

  // 1. Double check your filename here!
  const localDb = await open({ 
    filename: './hortiverse.sqlite', // Change this!
    driver: sqlite3.Database 
  });

  const turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const tables = await localDb.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");

    for (let table of tables) {
      console.log(`📦 Creating table: ${table.name}...`);
      
      try {
        // Clean up SQL: Turso sometimes dislikes "AUTOINCREMENT" in specific spots 
        // or double quotes in create statements.
        await turso.execute(table.sql); 
      } catch (err) {
        if (err.message.includes("already exists")) {
          console.log(`⚠️ Table ${table.name} already exists in Turso, skipping creation...`);
        } else {
          console.error(`❌ Error creating table ${table.name}:`, err.message);
          console.log("Failed SQL:", table.sql);
          continue; // Move to next table
        }
      }

      const rows = await localDb.all(`SELECT * FROM ${table.name}`);
      console.log(`🚚 Transferring ${rows.length} rows for ${table.name}...`);

      for (let row of rows) {
        const columns = Object.keys(row).join(', ');
        const placeholders = Object.keys(row).map(() => '?').join(', ');
        const values = Object.values(row);

        try {
          await turso.execute({
            sql: `INSERT INTO ${table.name} (${columns}) VALUES (${placeholders})`,
            args: values
          });
        } catch (insertErr) {
          console.error(`❌ Failed to insert row into ${table.name}:`, insertErr.message);
        }
      }
      console.log(`✅ ${table.name} transfer complete.`);
    }
    console.log("🎉 MIGRATION FINISHED!");
  } catch (globalErr) {
    console.error("💀 Critical Migration Error:", globalErr);
  } finally {
    await localDb.close();
  }
}

migrateDatabase();