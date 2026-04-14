const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'aura.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✓ Connected to aura.db');
  }
});

// ---- USER FUNCTIONS ----

// Create a new user account
function createUser(fullName, email, passwordHash, displayName, callback) {
  console.log('Creating user:', { fullName, email, displayName });
  
  db.run(
    `INSERT INTO users (full_name, email, password_hash, display_name) VALUES (?, ?, ?, ?)`,
    [fullName, email, passwordHash, displayName],
    function(err) {
      if (err) {
        console.error('❌ Error creating user:', err.message);
        return callback(err);
      }
      console.log('✓ User created with ID:', this.lastID);
      callback(null, { id: this.lastID });
    }
  );
}

// Get user by email
function getUserByEmail(email, callback) {
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
    if (err) {
      console.error('❌ Error fetching user by email:', err.message);
      return callback(err);
    }
    if (row) {
      console.log('✓ Found user:', row.email);
    } else {
      console.log('ℹ No user found with email:', email);
    }
    callback(null, row);
  });
}

// Get user by ID
function getUserById(userId, callback) {
  db.get(`SELECT id, full_name, email, display_name, role, created_at, updated_at FROM users WHERE id = ?`, [userId], callback);
}

// Update user
function updateUser(userId, updates, callback) {
  const fields = [];
  const values = [];
  
  if (updates.full_name) {
    fields.push('full_name = ?');
    values.push(updates.full_name);
  }
  if (updates.display_name) {
    fields.push('display_name = ?');
    values.push(updates.display_name);
  }
  if (updates.email) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  
  if (fields.length === 0) return callback(new Error('No fields to update'));
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);
  
  db.run(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values,
    callback
  );
}

// Get all users (admin)
function getAllUsers(callback) {
  db.all(`SELECT id, full_name, email, display_name, role, created_at FROM users ORDER BY created_at DESC`, callback);
}

// ---- SIGN-IN LOG FUNCTIONS ----

// Log a sign-in
function logSignIn(userId, ipAddress, callback) {
  console.log('📝 Logging sign-in for user ID:', userId);
  
  db.run(
    `INSERT INTO signin_logs (user_id, ip_address) VALUES (?, ?)`,
    [userId, ipAddress],
    function(err) {
      if (err) {
        console.error('❌ Error logging sign-in:', err.message);
        return callback(err);
      }
      console.log('✓ Sign-in logged');
      callback();
    }
  );
}

// Get all sign-in logs for a user
function getSignInLogs(userId, callback) {
  db.all(
    `SELECT * FROM signin_logs WHERE user_id = ? ORDER BY signin_time DESC`,
    [userId],
    callback
  );
}

// ---- TRANSACTION FUNCTIONS ----

// Create a new transaction
function createTransaction(senderId, recipientName, amount, currency, status, proofFile, callback) {
  db.run(
    `INSERT INTO transactions (sender_id, recipient_name, amount, currency, status, proof_file) VALUES (?, ?, ?, ?, ?, ?)`,
    [senderId, recipientName, amount, currency || 'CFA', status || 'pending', proofFile],
    function(err) {
      if (err) return callback(err);
      db.get(`SELECT * FROM transactions WHERE id = ?`, [this.lastID], callback);
    }
  );
}

// Get all transactions for a user
function getUserTransactions(userId, callback) {
  db.all(
    `SELECT * FROM transactions WHERE sender_id = ? ORDER BY created_at DESC`,
    [userId],
    callback
  );
}

// Get transaction by ID
function getTransactionById(transactionId, callback) {
  db.get(`SELECT * FROM transactions WHERE id = ?`, [transactionId], callback);
}

// Get all transactions (admin)
function getAllTransactions(callback) {
  db.all(
    `SELECT t.*, u.full_name as sender_name FROM transactions t LEFT JOIN users u ON t.sender_id = u.id ORDER BY t.created_at DESC`,
    callback
  );
}

// Update transaction status
function updateTransactionStatus(transactionId, status, callback) {
  db.run(
    `UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, transactionId],
    callback
  );
}

// ---- ADMIN LOG FUNCTIONS ----

// Log admin action
function logAdminAction(adminId, action, targetType, targetId, details, callback) {
  db.run(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`,
    [adminId, action, targetType, targetId, details],
    callback
  );
}

// ---- STATISTICS FUNCTIONS ----

// Get total users
function getTotalUsers(callback) {
  db.get(`SELECT COUNT(*) as count FROM users`, callback);
}

// Get total transactions
function getTotalTransactions(callback) {
  db.get(`SELECT COUNT(*) as count FROM transactions`, callback);
}

// Get total transaction amount
function getTotalTransactionAmount(callback) {
  db.get(`SELECT SUM(amount) as total FROM transactions`, callback);
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  updateUser,
  getAllUsers,
  logSignIn,
  getSignInLogs,
  createTransaction,
  getUserTransactions,
  getTransactionById,
  getAllTransactions,
  updateTransactionStatus,
  logAdminAction,
  getTotalUsers,
  getTotalTransactions,
  getTotalTransactionAmount,
  db
};
