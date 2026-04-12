from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
import csv
from io import StringIO
from flask import Response

app = Flask(__name__)

# =========================
# DATABASE CONFIG
# =========================
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# =========================
# MODELS (ENHANCED)
# =========================
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True)
    password = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    recipient_name = db.Column(db.String(100))
    amount = db.Column(db.Float)
    currency = db.Column(db.String(10), default='RUB')  # e.g., RUB, XOF, USD
    status = db.Column(db.String(50), default='pending')  # pending, completed, cancelled
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('transactions', lazy=True))


# =========================
# CREATE DB (if not exists)
# =========================
with app.app_context():
    db.create_all()


# =========================
# SERVE HTML PAGES
# =========================
@app.route('/')
def home():
    return send_from_directory('.', 'index.html')

@app.route('/signup-page')
def signup_page():
    return send_from_directory('.', 'signup.html')

@app.route('/send-money')
def send_money_page():
    return send_from_directory('.', 'send-money.html')


# =========================
# DASHBOARD (NEW)
# =========================
@app.route('/dashboard')
def dashboard():
    """Admin dashboard to view users, transactions, daily totals."""
    return render_template_string(DASHBOARD_HTML)


# =========================
# API: USERS
# =========================
@app.route('/api/users')
def api_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([
        {
            'id': u.id,
            'full_name': u.full_name,
            'email': u.email,
            'created_at': u.created_at.isoformat()
        } for u in users
    ])


# =========================
# API: TRANSACTIONS (with user name)
# =========================
@app.route('/api/transactions')
def api_transactions():
    txs = Transaction.query.order_by(Transaction.created_at.desc()).all()
    return jsonify([
        {
            'id': t.id,
            'user_id': t.user_id,
            'user_name': t.user.full_name if t.user else 'Unknown',
            'recipient_name': t.recipient_name,
            'amount': t.amount,
            'currency': t.currency,
            'status': t.status,
            'created_at': t.created_at.isoformat()
        } for t in txs
    ])


# =========================
# API: DAILY STATISTICS (group by date, currency)
# =========================
@app.route('/api/daily-stats')
def api_daily_stats():
    # Group by date (just the date part) and currency
    from sqlalchemy import func
    daily = db.session.query(
        func.date(Transaction.created_at).label('date'),
        Transaction.currency,
        func.sum(Transaction.amount).label('total_amount')
    ).group_by('date', Transaction.currency).order_by('date').all()

    return jsonify([
        {'date': row.date, 'currency': row.currency, 'total': row.total_amount}
        for row in daily
    ])


# =========================
# EXPORT TO CSV
# =========================
@app.route('/export/csv')
def export_csv():
    # Fetch all transactions with user info
    txs = Transaction.query.join(User).add_columns(
        Transaction.id,
        User.full_name.label('user_name'),
        Transaction.recipient_name,
        Transaction.amount,
        Transaction.currency,
        Transaction.status,
        Transaction.created_at
    ).order_by(Transaction.created_at.desc()).all()

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'User', 'Recipient', 'Amount', 'Currency', 'Status', 'Date'])
    for tx in txs:
        writer.writerow([
            tx.id,
            tx.user_name,
            tx.recipient_name or '',
            tx.amount,
            tx.currency,
            tx.status,
            tx.created_at.isoformat()
        ])

    # Return as downloadable file
    output.seek(0)
    return Response(
        output,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=transactions.csv'}
    )


# =========================
# SIGNUP API (UPDATED: store plain password)
# =========================
@app.route('/signup', methods=['POST'])
def signup():
    data = request.json
    # In a real app, hash the password!
    user = User(
        full_name=data['fullName'],
        email=data['email'],
        password=data['password']   # WARNING: plain text, hash it!
    )
    db.session.add(user)
    db.session.commit()
    print(f"🟢 New user: {user.email}")
    return jsonify({"message": "Account created", "user_id": user.id})


# =========================
# CREATE TRANSACTION (UPDATED: accept currency and recipient)
# =========================
@app.route('/transaction', methods=['POST'])
def create_transaction():
    data = request.json
    tx = Transaction(
        user_id=data['user_id'],
        recipient_name=data.get('recipient_name'),
        amount=data['amount'],
        currency=data.get('currency', 'RUB'),
        status='pending'
    )
    db.session.add(tx)
    db.session.commit()
    print(f"💰 Transaction: User {tx.user_id} sent {tx.amount} {tx.currency}")
    return jsonify({"message": "Transaction created", "tx_id": tx.id})


# =========================
# CANCEL TRANSACTION
# =========================
@app.route('/transaction/<int:tx_id>/cancel', methods=['POST'])
def cancel_transaction(tx_id):
    tx = Transaction.query.get(tx_id)
    if not tx:
        return jsonify({"error": "Not found"}), 404
    tx.status = "cancelled"
    db.session.commit()
    print(f"❌ Transaction {tx_id} cancelled")
    return jsonify({"message": "Cancelled"})


# =========================
# HTML TEMPLATE FOR DASHBOARD (embedded)
# =========================
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura Payment - Admin Dashboard</title>
    <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: #f7fafc; margin: 0; padding: 20px; }
        .container { max-width: 1400px; margin: auto; }
        h1 { color: #0b1b3a; margin-bottom: 0.5rem; }
        .card { background: white; border-radius: 24px; padding: 20px; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f7fafc; font-weight: 600; color: #2d3748; }
        tr:hover { background: #f7fafc; }
        .badge { padding: 4px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; }
        .status-pending { background: #feebc8; color: #c05621; }
        .status-completed { background: #c6f6d5; color: #2f855a; }
        .status-cancelled { background: #fed7d7; color: #c53030; }
        .btn { display: inline-block; background: #0b1b3a; color: white; padding: 8px 16px; border-radius: 12px; text-decoration: none; margin: 10px 10px 10px 0; }
        .btn-secondary { background: #718096; }
        .export-btn { background: #059669; }
        .currency { font-weight: 600; }
        .loading { text-align: center; padding: 40px; color: #718096; }
        .error { color: #e53e3e; padding: 20px; text-align: center; }
    </style>
</head>
<body>
<div class="container">
    <h1>📊 Aura Payment Dashboard</h1>
    <div style="margin-bottom: 20px;">
        <a href="/export/csv" class="btn export-btn">📥 Download CSV</a>
        <a href="/" class="btn btn-secondary">🏠 Home</a>
    </div>

    <!-- Users Table -->
    <div class="card">
        <h2>👥 Users</h2>
        <div id="users-loading" class="loading">Loading users...</div>
        <div id="users-error" class="error" style="display:none;"></div>
        <table id="users-table" style="display:none;">
            <thead>
                <tr><th>ID</th><th>Full Name</th><th>Email</th><th>Created At</th></tr>
            </thead>
            <tbody></tbody>
        </table>
    </div>

    <!-- Transactions Table -->
    <div class="card">
        <h2>💸 Transactions</h2>
        <div id="tx-loading" class="loading">Loading transactions...</div>
        <div id="tx-error" class="error" style="display:none;"></div>
        <table id="tx-table" style="display:none;">
            <thead>
                <tr><th>ID</th><th>User</th><th>Recipient</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody></tbody>
        </table>
    </div>

    <!-- Daily Statistics -->
    <div class="card">
        <h2>📅 Daily Totals by Currency</h2>
        <div id="stats-loading" class="loading">Loading statistics...</div>
        <div id="stats-error" class="error" style="display:none;"></div>
        <table id="stats-table" style="display:none;">
            <thead><tr><th>Date</th><th>Currency</th><th>Total Amount</th></tr></thead>
            <tbody></tbody>
        </table>
    </div>
</div>

<script>
    async function fetchData(url, elementId, renderFunc) {
        const loadingDiv = document.getElementById(`${elementId}-loading`);
        const errorDiv = document.getElementById(`${elementId}-error`);
        const table = document.getElementById(`${elementId}-table`);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            loadingDiv.style.display = 'none';
            table.style.display = 'table';
            renderFunc(data);
        } catch (err) {
            loadingDiv.style.display = 'none';
            errorDiv.textContent = `Error: ${err.message}`;
            errorDiv.style.display = 'block';
        }
    }

    function renderUsers(users) {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        users.forEach(u => {
            const row = tbody.insertRow();
            row.insertCell().textContent = u.id;
            row.insertCell().textContent = u.full_name;
            row.insertCell().textContent = u.email;
            row.insertCell().textContent = new Date(u.created_at).toLocaleString();
        });
    }

    function renderTransactions(txs) {
        const tbody = document.querySelector('#tx-table tbody');
        tbody.innerHTML = '';
        txs.forEach(t => {
            const row = tbody.insertRow();
            row.insertCell().textContent = t.id;
            row.insertCell().textContent = t.user_name;
            row.insertCell().textContent = t.recipient_name || '-';
            row.insertCell().innerHTML = `<span class="currency">${t.amount} ${t.currency}</span>`;
            const statusClass = `status-${t.status}`;
            row.insertCell().innerHTML = `<span class="badge ${statusClass}">${t.status}</span>`;
            row.insertCell().textContent = new Date(t.created_at).toLocaleString();
        });
    }

    function renderStats(stats) {
        const tbody = document.querySelector('#stats-table tbody');
        tbody.innerHTML = '';
        stats.forEach(s => {
            const row = tbody.insertRow();
            row.insertCell().textContent = s.date;
            row.insertCell().textContent = s.currency;
            row.insertCell().innerHTML = `<span class="currency">${s.total.toFixed(2)} ${s.currency}</span>`;
        });
    }

    fetchData('/api/users', 'users', renderUsers);
    fetchData('/api/transactions', 'tx', renderTransactions);
    fetchData('/api/daily-stats', 'stats', renderStats);
</script>
</body>
</html>
"""

# =========================
# RUN SERVER
# =========================
if __name__ == '__main__':
    app.run(debug=True)
