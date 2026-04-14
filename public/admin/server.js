require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------- Database Setup -------------------
const db = new sqlite3.Database('./aura.db', (err) => {
    if (err) console.error('❌ Database connection error:', err.message);
    else console.log('✅ Connected to SQLite database');
});

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recipient TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'CFA',
        status TEXT DEFAULT 'pending',
        proof_file TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sign_in_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip TEXT,
        signed_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(admin_id) REFERENCES users(id)
    )`);
});

// ------------------- Middleware -------------------
app.use(helmet({ contentSecurityPolicy: false }));

// ✅ FIXED CORS: Allow requests from your frontend (localhost:5002)
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5002'], credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

// File upload setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(file.mimetype) && allowed.test(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPG, PNG, PDF, GIF, WebP allowed.'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadsDir));

// ------------------- Helper Functions -------------------
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ------------------- Auth Routes -------------------
app.post('/api/auth/signup',
    body('fullName').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { fullName, email, password, displayName } = req.body;
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (user) return res.status(400).json({ error: 'Email already registered' });

            const hashed = await bcrypt.hash(password, 10);
            const display = displayName || fullName.split(' ')[0];
            db.run('INSERT INTO users (full_name, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
                [fullName, email, hashed, display], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const token = jwt.sign({ id: this.lastID, role: 'user' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });
                    res.status(201).json({ token, user: { id: this.lastID, full_name: fullName, email, display_name: display, role: 'user' } });
                });
        });
    });

app.post('/api/auth/login',
    body('email').isEmail(),
    body('password').notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { email, password } = req.body;
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

            const ip = req.ip || req.connection.remoteAddress;
            db.run('INSERT INTO sign_in_logs (user_id, ip) VALUES (?, ?)', [user.id, ip]);

            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });
            const { password_hash, ...userData } = user;
            res.json({ token, user: userData });
        });
    });

app.get('/api/user', authenticate, (req, res) => {
    db.get('SELECT id, full_name, email, display_name, role, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

// ------------------- Transaction Routes -------------------
app.post('/api/transactions', authenticate, upload.single('proof'), (req, res) => {
    const { recipient, amount, currency } = req.body;
    const proofFile = req.file ? req.file.filename : null;
    if (!recipient || !amount) {
        if (req.file) fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
        return res.status(400).json({ error: 'Recipient and amount required' });
    }

    db.run('INSERT INTO transactions (user_id, recipient, amount, currency, status, proof_file) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, recipient, parseFloat(amount), currency || 'CFA', proofFile ? 'uploaded' : 'pending', proofFile],
        function(err) {
            if (err) {
                if (req.file) fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ success: true, transactionId: this.lastID, proofUrl: proofFile ? `/uploads/${proofFile}` : null });
        });
});

app.get('/api/transactions', authenticate, (req, res) => {
    db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ------------------- Admin Routes -------------------
app.get('/api/admin/users', authenticate, adminOnly, (req, res) => {
    db.all('SELECT id, full_name, email, display_name, role, created_at FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/transactions', authenticate, adminOnly, (req, res) => {
    db.all('SELECT * FROM transactions ORDER BY created_at DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/admin/transactions/:id', authenticate, adminOnly,
    body('status').isIn(['pending', 'uploaded', 'completed', 'failed', 'cancelled']),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { status } = req.body;
        const id = req.params.id;
        db.run('UPDATE transactions SET status = ? WHERE id = ?', [status, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
            db.run('INSERT INTO admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
                [req.user.id, 'update_transaction_status', 'transaction', id, JSON.stringify({ new_status: status })]);
            res.json({ success: true });
        });
    });

// ------------------- Start Server -------------------
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`📂 Uploads directory: ${uploadsDir}`);
});