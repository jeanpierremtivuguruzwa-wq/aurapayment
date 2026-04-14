const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Main function to create account
async function createAccount() {
  try {
    // Get user input
    const fullName = await prompt('Full Name: ');
    const displayName = await prompt('Display Name: ');
    const email = await prompt('Email: ');
    const password = await prompt('Password: ');

    // Validate inputs
    if (!fullName || !displayName || !email || !password) {
      console.log('❌ All fields are required!');
      rl.close();
      return;
    }

    if (password.length < 6) {
      console.log('❌ Password must be at least 6 characters!');
      rl.close();
      return;
    }

    // Connect to database
    const db = new sqlite3.Database('./aura.db', (err) => {
      if (err) {
        console.log('❌ Database connection error:', err);
        rl.close();
        return;
      }
      console.log('✓ Connected to database');

      // Check if email already exists
      db.get('SELECT email FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          console.log('❌ Database error:', err);
          db.close();
          rl.close();
          return;
        }

        if (row) {
          console.log('❌ Email already registered!');
          db.close();
          rl.close();
          return;
        }

        // Hash password
        bcrypt.hash(password, 10, (err, hashedPassword) => {
          if (err) {
            console.log('❌ Error hashing password:', err);
            db.close();
            rl.close();
            return;
          }

          // Insert user into database
          db.run(
            'INSERT INTO users (full_name, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
            [fullName, email, hashedPassword, displayName, 'user'],
            function(err) {
              if (err) {
                console.log('❌ Error creating account:', err);
              } else {
                console.log('\n✅ Account created successfully!');
                console.log('User ID:', this.lastID);
                console.log('Email:', email);
                console.log('Display Name:', displayName);
              }

              db.close();
              rl.close();
            }
          );
        });
      });
    });
  } catch (error) {
    console.log('❌ Error:', error);
    rl.close();
  }
}

console.log('--- Create Account ---');
createAccount();
