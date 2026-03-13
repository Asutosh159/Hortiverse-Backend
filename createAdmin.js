const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./hortiverse.sqlite');

// CHANGE THESE TO YOUR PREFERRED DETAILS
const adminName = "Bharat Chandra Biswal";
const adminEmail = "bharat@hortiverse.com";
const adminPassword = "od33aw4132"; // Change this!

async function makeAdmin() {
    try {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        const sql = `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`;
        
        db.run(sql, [adminName, adminEmail, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes("UNIQUE constraint failed")) {
                    console.log("❌ Error: An account with this email already exists.");
                } else {
                    console.error("❌ Database Error:", err.message);
                }
            } else {
                console.log("✅ SuperAdmin Created Successfully!");
                console.log(`Email: ${adminEmail}`);
                console.log(`Name: ${adminName}`);
            }
            db.close();
        });
    } catch (err) {
        console.error("❌ Script Error:", err);
    }
}

makeAdmin();