import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';

// ---------- Firebase Client & Admin Initialization ----------
const firebaseConfig = {
  apiKey: "AIzaSyDlz5mH-x7P7H6FNdPj62PYhqAY5hsH19A",
  authDomain: "aura-payment.firebaseapp.com",
  projectId: "aura-payment",
  storageBucket: "aura-payment.firebasestorage.app",
  messagingSenderId: "213847107667",
  appId: "1:213847107667:web:9949c7a1ad9101959afea6",
  measurementId: "G-YG1G8CGC07"
};
initializeApp(firebaseConfig);
console.log("Firebase client initialized");

admin.initializeApp({ projectId: "aura-payment" });
const db = getFirestore();

// ---------- Secrets ----------
const geminiApiKey = defineSecret('GEMINI_API_KEY');
// GMAIL_USER and GMAIL_PASS are read at runtime via process.env (Gen 2 secret injection)

// ---------- Nodemailer helper ----------
function createTransporter(user, pass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ---------- Express API (mounted as a Cloud Function) ----------
const apiApp = express();
apiApp.use(helmet());
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// Helper: verify Firebase ID token from Authorization header
async function verifyFirebaseToken(req, res) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

// Get transactions for the authenticated user only
apiApp.get('/transactions', async (req, res) => {
  const decoded = await verifyFirebaseToken(req, res);
  if (!decoded) return;
  try {
    const snapshot = await db.collection('transactions').where('userId', '==', decoded.uid).get();
    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
apiApp.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the Express app as a Cloud Function named 'api'
export const api = onRequest(apiApp);

// ---------- Firestore Triggers ----------
export const onTransactionCreate = onDocumentCreated('transactions/{transactionId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const transaction = snapshot.data();
  const transactionId = event.params.transactionId;
  await db.collection('adminNotifications').add({
    message: `New transaction #${transactionId}: ${transaction.amountSent} ${transaction.currencySent} → ${transaction.recipientName || 'Unknown'}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    transactionId
  });
  console.log(`Notification created for transaction ${transactionId}`);
});

export const updatePaymentMethodTotals = onDocumentUpdated('transactions/{transactionId}', async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  if (beforeData.status === 'completed' || afterData.status !== 'completed') return;
  const transaction = afterData;
  const paymentMethodId = transaction.paymentMethodId;
  if (!paymentMethodId) {
    console.warn('No paymentMethodId on transaction', event.params.transactionId);
    return;
  }
  const methodRef = db.collection('paymentMethods').doc(paymentMethodId);
  const methodSnap = await methodRef.get();
  if (!methodSnap.exists) {
    console.warn(`Payment method ${paymentMethodId} not found`);
    return;
  }
  const currentTotal = methodSnap.data().totalReceived || 0;
  const newTotal = currentTotal + transaction.amountReceived;
  await methodRef.update({ totalReceived: newTotal });
  console.log(`Updated ${paymentMethodId} totalReceived to ${newTotal}`);
});

export const autoFlagTransaction = onDocumentCreated('transactions/{transactionId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const transaction = snapshot.data();
  if (transaction.flagged || transaction.status === 'completed') return;

  const prompt = `
    Analyze this payment transaction for fraud risk.
    Amount: ${transaction.amountSent} ${transaction.currencySent}
    Recipient: ${transaction.recipientName || 'Unknown'}
    Provider: ${transaction.provider || 'Not specified'}
    Payment method: ${transaction.paymentMethod || 'Not specified'}
    Return ONLY a single word: LOW, MEDIUM, or HIGH.
  `;
  const genAI = new GoogleGenerativeAI(geminiApiKey.value());
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const result = await model.generateContent(prompt);
  const riskLevel = (await result.response).text().trim().toUpperCase();

  if (riskLevel === 'HIGH') {
    await snapshot.ref.update({ flagged: true, riskLevel });
    await db.collection('adminNotifications').add({
      message: `🚨 High‑risk transaction flagged: ${transaction.amountSent} ${transaction.currencySent} to ${transaction.recipientName}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      transactionId: event.params.transactionId
    });
  } else {
    await snapshot.ref.update({ riskLevel });
  }
});

// ---------- AI Callable Functions ----------
export const askGemini = onCall({ secrets: [geminiApiKey] }, async (request) => {
  // Optional: if (!request.auth) throw new Error('Unauthenticated');
  const userPrompt = request.data.prompt;
  if (!userPrompt || typeof userPrompt !== 'string') {
    throw new Error('Missing or invalid prompt');
  }
  const genAI = new GoogleGenerativeAI(geminiApiKey.value());
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  try {
    const result = await model.generateContent(userPrompt);
    const text = (await result.response).text();
    return { success: true, message: text };
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('AI request failed');
  }
});

export const suggestReply = onCall({ secrets: [geminiApiKey] }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated');
  const { message } = request.data;
  if (!message) throw new Error('Missing message');
  const prompt = `Generate 3 short, helpful replies to this customer message: "${message}". Return as JSON array of strings.`;
  const genAI = new GoogleGenerativeAI(geminiApiKey.value());
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const result = await model.generateContent(prompt);
  const suggestions = JSON.parse((await result.response).text());
  return { suggestions };
});

// ---------- Scheduled Functions ----------
export const dailySummary = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Europe/Moscow', secrets: [geminiApiKey] },
  async (event) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const startOfDay = admin.firestore.Timestamp.fromDate(yesterday);
    const endOfDay = admin.firestore.Timestamp.fromDate(new Date(yesterday.getTime() + 86400000));

    const snapshot = await db.collection('transactions')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<', endOfDay)
      .get();

    const transactions = snapshot.docs.map(doc => doc.data());
    if (transactions.length === 0) return;

    const prompt = `Summarize these transactions in 2‑3 sentences: ${JSON.stringify(transactions)}`;
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const summary = (await result.response).text();

    await db.collection('dailySummaries').add({
      date: admin.firestore.Timestamp.fromDate(yesterday),
      summary,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // Optional: send email (requires email service)
  }
);

export const processRecurringPayments = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Europe/Moscow' },
  async (event) => {
    const now = admin.firestore.Timestamp.now();
    const duePayments = await db.collection('recurringPayments')
      .where('active', '==', true)
      .where('nextRun', '<=', now)
      .get();

    for (const doc of duePayments.docs) {
      const data = doc.data();
      await db.collection('transactions').add({
        userId: data.userId,
        amountSent: data.amount,
        currencySent: data.currency,
        recipientName: data.recipientName,
        status: 'pending',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRecurring: true,
        recurringId: doc.id
      });
      let nextDate = new Date(data.nextRun.toDate());
      switch (data.frequency) {
        case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
      }
      await doc.ref.update({
        nextRun: admin.firestore.Timestamp.fromDate(nextDate),
        lastRun: now
      });
    }
  }
);

// ---------- Auto-sync currency rates from currencylayer ──────────────────────
// Runs every 60 minutes. Reads API key from appSettings/main.currencyLayerKey,
// fetches live USD-based quotes, computes cross rates applying per-pair spread,
// and batch-updates all active currencyPair documents so the public dashboard
// shows live rates without any manual admin action.
const TRACKED_CURRENCIES = ["XOF","XAF","RUB","EUR","GBP","CNY","AED","GHS","NGN","USD"];
function crossRate(quotes, from, to) {
  const norm = (c) => (c === "USDT" ? "USD" : c);
  const f = norm(from);
  const t = norm(to);
  const fromRate = f === "USD" ? 1 : quotes[`USD${f}`];
  const toRate   = t === "USD" ? 1 : quotes[`USD${t}`];
  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}
export const syncCurrencyRates = onSchedule({
  schedule: "every 60 minutes",
  timeZone: "UTC",
  timeoutSeconds: 120,
}, async () => {
  const settingsSnap = await db.collection("appSettings").doc("main").get();
  const apiKey = settingsSnap.data()?.currencyLayerKey;
  if (!apiKey) {
    console.log("syncCurrencyRates: no API key set — skipping.");
    return;
  }

  const symbols = TRACKED_CURRENCIES.filter(c => c !== "USDT").join(",");
  const url = `http://api.currencylayer.com/live?access_key=${apiKey}&currencies=${symbols}&source=USD&format=1`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`syncCurrencyRates: HTTP ${res.status}`);
    return;
  }
  const json = await res.json();
  if (!json.success) {
    console.error("syncCurrencyRates: API error —", json.error?.info);
    return;
  }
  const quotes = json.quotes ?? {};
  console.log(`syncCurrencyRates: fetched ${Object.keys(quotes).length} quotes`);

  const pairsSnap = await db.collection("currencyPairs")
    .where("active", "==", true).get();

  const batch = db.batch();
  let updated = 0, skipped = 0;

  for (const doc of pairsSnap.docs) {
    const pair = doc.data();
    const market = crossRate(quotes, pair.from, pair.to);
    if (market === null) { skipped++; continue; }

    let newRate;
    if (pair.spreadType === "percent") {
      newRate = market * (1 - (pair.spread ?? 0) / 100);
    } else {
      newRate = market - (pair.spread ?? 0);
    }
    if (newRate <= 0) { skipped++; continue; }

    batch.update(doc.ref, {
      rate: parseFloat(newRate.toFixed(6)),
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      syncSource: "currencylayer",
    });
    updated++;
  }

  await batch.commit();
  console.log(`syncCurrencyRates: updated=${updated}, skipped=${skipped}`);
});

// ---------- Email Notification on Proof Upload ----------
// Fires when an order's status changes to 'uploaded' (client submitted payment proof).
// Reads all active notificationRecipients from Firestore, then writes to the `mail`
// collection which the firestore-send-email extension monitors and dispatches.
export const notifyOnProofUpload = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  // Only trigger when status transitions to 'uploaded'
  if (!before || !after) return;
  if (before.status === after.status) return;
  if (after.status !== 'uploaded') return;

  const orderId = event.params.orderId;

  // Gather active notification recipient emails
  const recipientsSnap = await db.collection('notificationRecipients')
    .where('active', '==', true)
    .get();

  if (recipientsSnap.empty) {
    console.log('No active notification recipients – skipping email.');
    return;
  }

  const toEmails = recipientsSnap.docs.map(d => d.data().email);

  const userEmail  = after.userEmail   || after.userId       || 'unknown';
  const amountSent = after.amountSent  ?? after.amount       ?? '?';
  const currSent   = after.sendCurrency ?? after.currencySent ?? '';
  const amountRec  = after.amountReceived ?? '?';
  const currRec    = after.receiveCurrency ?? after.currencyReceived ?? '';
  const proofFile  = after.proofFileName || 'uploaded';
  const adminLink  = 'https://aura-payment.web.app/admin/';

  const subject = `⚠️ Payment Proof Uploaded – Order ${orderId}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
      <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
        <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Admin Notification</p>
      </div>
      <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="margin-top:0;color:#0b1b3a;">Payment Proof Received</h2>
        <p>A client has uploaded their payment proof and is waiting for you to complete the transaction.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;">
          <tr style="background:#edf2f7;">
            <td style="padding:10px 14px;font-weight:600;width:40%;">Order ID</td>
            <td style="padding:10px 14px;font-family:monospace;">${orderId}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;">Client Email</td>
            <td style="padding:10px 14px;">${userEmail}</td>
          </tr>
          <tr style="background:#edf2f7;">
            <td style="padding:10px 14px;font-weight:600;">Amount Sent</td>
            <td style="padding:10px 14px;">${amountSent} ${currSent}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;">Amount to Receive</td>
            <td style="padding:10px 14px;">${amountRec} ${currRec}</td>
          </tr>
          <tr style="background:#edf2f7;">
            <td style="padding:10px 14px;font-weight:600;">Proof File</td>
            <td style="padding:10px 14px;font-family:monospace;font-size:13px;">${proofFile}</td>
          </tr>
        </table>
        <a href="${adminLink}" style="display:inline-block;background:#0b1b3a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Open Admin Dashboard →
        </a>
        <p style="margin-top:32px;font-size:13px;color:#718096;">
          Go to <strong>Orders</strong> in the admin dashboard, find this order, review the proof, then mark it as complete.
        </p>
      </div>
    </div>
  `;

  await db.collection('mail').add({
    to: toEmails,
    message: { subject, html },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Email queued for ${toEmails.length} recipient(s) for order ${orderId}`);
});

// ─── Email notification on NEW order ─────────────────────────────────────────
export const notifyOnNewOrder = onDocumentCreated(
  { document: 'orders/{orderId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;

    const orderId = event.params.orderId;

    // Gather active notification recipient emails
    const recipientsSnap = await db.collection('notificationRecipients')
      .where('active', '==', true)
      .get();

    if (recipientsSnap.empty) {
      console.log('[newOrder] No active notification recipients – skipping.');
      return;
    }

    const toEmails = recipientsSnap.docs.map(d => d.data().email);

    const userEmail       = order.userEmail     || order.userId         || 'unknown';
    const senderName      = order.senderName    || order.recipientName  || '';
    const sendAmount      = order.sendAmount    ?? order.amount         ?? '?';
    const sendCurrency    = order.sendCurrency  ?? '';
    const receiveAmount   = order.receiveAmount ?? order.amountReceived ?? '?';
    const receiveCurrency = order.receiveCurrency ?? '';
    const paymentMethod   = order.paymentMethod || order.provider       || '—';
    const deliveryMethod  = order.deliveryMethod                        || '—';
    const adminLink       = 'https://aura-payment.web.app/admin/';

    const subject = `New Order Received - ${sendAmount} ${sendCurrency}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">New Order Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <h2 style="margin-top:0;color:#0b1b3a;">A new order has been placed</h2>
          <p style="color:#4a5568;">Review it in the admin dashboard and begin processing.</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <tr style="background:#edf2f7;">
              <td style="padding:10px 14px;font-weight:600;width:40%;">Order ID</td>
              <td style="padding:10px 14px;font-family:monospace;font-size:13px;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;">Client Email</td>
              <td style="padding:10px 14px;">${userEmail}</td>
            </tr>
            ${senderName ? '<tr style="background:#edf2f7;"><td style="padding:10px 14px;font-weight:600;">Sender Name</td><td style="padding:10px 14px;">' + senderName + '</td></tr>' : ''}
            <tr style="background:#edf2f7;">
              <td style="padding:10px 14px;font-weight:600;">Sending</td>
              <td style="padding:10px 14px;font-size:16px;font-weight:700;color:#0b1b3a;">${sendAmount} ${sendCurrency}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;">Receiving</td>
              <td style="padding:10px 14px;font-size:16px;font-weight:700;color:#276749;">${receiveAmount} ${receiveCurrency}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:10px 14px;font-weight:600;">Payment Method</td>
              <td style="padding:10px 14px;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;">Delivery Method</td>
              <td style="padding:10px 14px;">${deliveryMethod}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:10px 14px;font-weight:600;">Status</td>
              <td style="padding:10px 14px;">
                <span style="background:#ebf8ff;color:#2b6cb0;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;">Pending</span>
              </td>
            </tr>
          </table>
          <a href="${adminLink}" style="display:inline-block;background:#0b1b3a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Open Admin Dashboard
          </a>
          <p style="margin-top:32px;font-size:13px;color:#718096;">
            Go to <strong>Orders</strong> in the admin dashboard to process this order.
          </p>
        </div>
      </div>
    `;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;

    if (!user || !pass) {
      console.error('[newOrder] GMAIL_USER or GMAIL_PASS secret not available');
      return;
    }

    const transporter = createTransporter(user, pass);

    await transporter.sendMail({
      from: `"Aura Payment" <${user}>`,
      to: toEmails.join(','),
      subject,
      html,
    });

    console.log(`[newOrder] Email sent to ${toEmails.join(', ')}, order ${orderId}`);
  }
);

// ─── Email user when their order is completed or cancelled ─────────────────────
// Fires on every order document update. When status transitions to 'completed'
// or 'cancelled', sends a confirmation email directly to the client's email
// address via Gmail (Nodemailer), using the same GMAIL_USER / GMAIL_PASS secrets.
export const notifyUserOnOrderComplete = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();

    if (!before || !after) return;
    if (before.status === after.status) return;
    if (after.status !== 'completed' && after.status !== 'cancelled') return;

    const userEmail = after.userEmail;
    if (!userEmail) {
      console.log('[orderComplete] No userEmail on order – skipping.');
      return;
    }

    const orderId     = event.params.orderId;
    const isCompleted = after.status === 'completed';

    // Resolve account owner name — prefer the value stored on the order,
    // otherwise look it up from the users collection via userId or email.
    let ownerName = after.senderName || after.fullName || '';
    if (!ownerName) {
      try {
        let userSnap = null;
        if (after.userId) {
          userSnap = await db.collection('users').doc(after.userId).get();
        }
        if (!userSnap?.exists && userEmail) {
          const q = await db.collection('users').where('email', '==', userEmail).limit(1).get();
          if (!q.empty) userSnap = q.docs[0];
        }
        if (userSnap?.exists) {
          const u = userSnap.data();
          ownerName = u.fullName || u.full_name || u.displayName || '';
        }
      } catch (e) {
        console.warn('[orderComplete] Could not fetch user profile:', e.message);
      }
    }

    const sendAmount      = after.sendAmount    ?? after.amount         ?? '?';
    const sendCurrency    = after.sendCurrency  ?? '';
    const receiveAmount   = after.receiveAmount ?? after.amountReceived ?? '?';
    const receiveCurrency = after.receiveCurrency ?? '';
    const paymentMethod   = after.paymentMethod || '—';
    const deliveryMethod  = after.deliveryMethod || '—';
    const historyLink     = 'https://aura-payment.web.app/history.html';
    const supportLink     = 'https://aura-payment.web.app/support.html';

    const completedHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Transaction Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
            <h2 style="margin:0;color:#276749;font-size:20px;">✅ Transaction Completed!</h2>
            <p style="margin:6px 0 0;color:#48bb78;font-size:14px;">Your money is on its way</p>
          </div>
          <p style="color:#4a5568;">
            Hi${ownerName ? ' ' + ownerName : ''},<br>
            Great news! Your transaction has been <strong style="color:#276749;">successfully completed</strong>.
            Your funds have been processed and sent. Here is a summary of your order:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;width:45%;">Order ID</td>
              <td style="padding:12px 16px;font-family:monospace;font-size:13px;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;">You Sent</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#0b1b3a;">${sendAmount} ${sendCurrency}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;">You Receive</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#276749;">${receiveAmount} ${receiveCurrency}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;">Payment Method</td>
              <td style="padding:12px 16px;">${paymentMethod}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;">Delivery Method</td>
              <td style="padding:12px 16px;">${deliveryMethod}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;">Status</td>
              <td style="padding:12px 16px;">
                <span style="background:#c6f6d5;color:#276749;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">✓ Completed</span>
              </td>
            </tr>
          </table>
          <a href="${historyLink}" style="display:inline-block;background:#276749;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            View Transaction History →
          </a>
          <p style="margin-top:28px;font-size:13px;color:#718096;">
            If you have any questions, visit our <a href="${supportLink}" style="color:#0b1b3a;">support page</a>.
            Thank you for using Aura Payment! 🎉
          </p>
        </div>
      </div>`;

    const cancelledHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Transaction Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
            <h2 style="margin:0;color:#c53030;font-size:20px;">❌ Transaction Cancelled</h2>
            <p style="margin:6px 0 0;color:#fc8181;font-size:14px;">Your order has been cancelled</p>
          </div>
          <p style="color:#4a5568;">
            Hi${ownerName ? ' ' + ownerName : ''},<br>
            We are writing to inform you that your transaction has been <strong style="color:#c53030;">cancelled</strong>.
            If you believe this was a mistake or need assistance, please contact our support team.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;width:45%;">Order ID</td>
              <td style="padding:12px 16px;font-family:monospace;font-size:13px;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;">Amount Sent</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#0b1b3a;">${sendAmount} ${sendCurrency}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;">Was to Receive</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#4a5568;">${receiveAmount} ${receiveCurrency}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;">Status</td>
              <td style="padding:12px 16px;">
                <span style="background:#fed7d7;color:#c53030;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">✗ Cancelled</span>
              </td>
            </tr>
          </table>
          <a href="${supportLink}" style="display:inline-block;background:#c53030;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Contact Support →
          </a>
          <p style="margin-top:28px;font-size:13px;color:#718096;">
            To place a new order visit <a href="https://aura-payment.web.app/send-money.html" style="color:#0b1b3a;">aura-payment.web.app</a>.
            We apologise for any inconvenience.
          </p>
        </div>
      </div>`;

    const subject = isCompleted
      ? `✅ Transaction Completed – Order ${orderId}`
      : `❌ Transaction Cancelled – Order ${orderId}`;
    const html = isCompleted ? completedHtml : cancelledHtml;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;

    if (!user || !pass) {
      console.error('[orderComplete] GMAIL_USER or GMAIL_PASS secret not available – cannot send email.');
      return;
    }

    const transporter = createTransporter(user, pass);
    await transporter.sendMail({
      from: `"Aura Payment" <${user}>`,
      to: userEmail,
      subject,
      html,
    });

    console.log(`[orderComplete] Email sent → ${userEmail}, order ${orderId}, status: ${after.status}`);
  }
);

// ─── Email user when support agent/admin replies to their ticket ──────────────
// Fires when a new message is added to supportTickets/{ticketId}/messages/.
// If the sender is admin or agent (role !== 'user'), emails the user so they
// know the support team has replied and their issue is being handled.
export const notifyUserOnSupportReply = onDocumentCreated(
  { document: 'supportTickets/{ticketId}/messages/{messageId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    // Only notify when admin or agent replies – not on user messages
    if (msg.role === 'user') return;

    const ticketId   = event.params.ticketId;
    const db         = getFirestore();

    // Fetch parent ticket to get user email and details
    const ticketSnap = await db.collection('supportTickets').doc(ticketId).get();
    if (!ticketSnap.exists) {
      console.log(`[supportReply] Ticket ${ticketId} not found – skipping.`);
      return;
    }

    const ticket    = ticketSnap.data();
    const userEmail = ticket?.userEmail;
    if (!userEmail) {
      console.log(`[supportReply] No userEmail on ticket ${ticketId} – skipping.`);
      return;
    }

    const userName   = ticket?.userName   || '';
    const subjectKey = ticket?.subject    || 'general';
    const replyText  = msg.text           || '';
    const senderName = msg.senderName     || 'Support Team';
    const supportLink = 'https://aura-payment.web.app/support.html';

    const CATEGORY = {
      transaction_delay: 'Transaction taking too long',
      proof_issue:       'Problem with proof of payment',
      wrong_amount:      'Wrong amount received',
      payment_failed:    'Payment failed',
      account_issue:     'Account issue',
      general:           'General question',
      other:             'Other',
    };
    const topicLabel = CATEGORY[subjectKey] || subjectKey;

    const subject = `Reply from Aura Support – ${topicLabel}`;
    const html    = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Support Team</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Support Reply</p>
            <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#1e3a8a;">${topicLabel}</p>
          </div>

          <p style="color:#4a5568;margin-top:0;">
            Hi${userName ? ' ' + userName : ''},<br><br>
            Our support team has replied to your enquiry. Here is their message:
          </p>

          <div style="background:white;border-left:4px solid #0b1b3a;border-radius:6px;padding:18px 22px;margin:20px 0;color:#1a202c;font-size:15px;line-height:1.6;">
            ${replyText.replace(/\n/g, '<br>')}
          </div>

          <p style="color:#718096;font-size:14px;">
            — <strong style="color:#0b1b3a;">${senderName}</strong>, Aura Payment Support
          </p>

          <a href="${supportLink}" style="display:inline-block;margin-top:8px;background:#0b1b3a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            View Your Support Ticket &rarr;
          </a>

          <p style="margin-top:28px;font-size:13px;color:#718096;">
            You can reply directly from the <a href="${supportLink}" style="color:#0b1b3a;font-weight:600;">support page</a>
            on our website. Our team is here to help and your issue is being handled.<br><br>
            Thank you for your patience.
          </p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="font-size:11px;color:#a0aec0;">
            Aura Payment &middot; <a href="https://aura-payment.web.app" style="color:#a0aec0;">aura-payment.web.app</a><br>
            This email was sent because you submitted a support request. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    if (!user || !pass) {
      console.error('[supportReply] GMAIL_USER or GMAIL_PASS secret not available – cannot send email.');
      return;
    }

    const transporter = createTransporter(user, pass);
    await transporter.sendMail({
      from:    `"Aura Payment Support" <${user}>`,
      to:      userEmail,
      subject,
      html,
    });

    console.log(`[supportReply] Email sent → ${userEmail}, ticket ${ticketId}`);
  }
);

// ─── Email active notification recipients when a new support ticket is opened ─
// Fires when any new supportTickets document is created (user submits a ticket
// from the support page). Reads all active notificationRecipients and emails
// them so the team can reply promptly to the user.
export const notifyAgentsOnNewSupportTicket = onDocumentCreated(
  { document: 'supportTickets/{ticketId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
  async (event) => {
    const ticket = event.data?.data();
    if (!ticket) return;

    const ticketId = event.params.ticketId;

    // Gather all active notification recipients (admins + agents marked active)
    const recipientsSnap = await db.collection('notificationRecipients')
      .where('active', '==', true)
      .get();

    if (recipientsSnap.empty) {
      console.log('[newTicket] No active notification recipients – skipping email.');
    }

    const userEmail  = ticket.userEmail  || 'unknown';
    const userName   = ticket.userName   || '';
    const subjectKey = ticket.subject    || 'general';
    const message    = ticket.message    || '';
    const orderId    = ticket.orderId    || null;
    const adminLink  = 'https://aura-payment.web.app/admin/';

    const CATEGORY = {
      transaction_delay: 'Transaction taking too long',
      proof_issue:       'Problem with proof of payment',
      wrong_amount:      'Wrong amount received',
      payment_failed:    'Payment failed',
      account_issue:     'Account issue',
      general:           'General question',
      other:             'Other',
    };
    const topicLabel = CATEGORY[subjectKey] || subjectKey;

    // Write in-app notification so the admin bell icon updates immediately
    await db.collection('adminNotifications').add({
      message:   `New support ticket from ${userName || userEmail} – ${topicLabel}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read:      false,
      type:      'support',
      ticketId,
      userEmail,
    });

    if (recipientsSnap.empty) return;

    const toEmails = recipientsSnap.docs.map(d => d.data().email).filter(Boolean);
    if (toEmails.length === 0) return;

    const emailSubject = `New Support Ticket – ${topicLabel}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Support Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">

          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#c2410c;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">New Support Ticket</p>
            <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#9a3412;">${topicLabel}</p>
          </div>

          <p style="color:#4a5568;margin-top:0;">
            A user has submitted a new support ticket and is waiting for a reply.<br>
            Please log in to the admin panel and respond as soon as possible.
          </p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr style="background:#edf2f7;">
              <td style="padding:11px 16px;font-weight:600;width:38%;color:#2d3748;">Ticket ID</td>
              <td style="padding:11px 16px;font-family:monospace;font-size:13px;color:#4a5568;">${ticketId}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-weight:600;color:#2d3748;">User</td>
              <td style="padding:11px 16px;color:#4a5568;">${userName ? userName + ' &lt;' + userEmail + '&gt;' : userEmail}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:11px 16px;font-weight:600;color:#2d3748;">Topic</td>
              <td style="padding:11px 16px;color:#4a5568;">${topicLabel}</td>
            </tr>
            ${orderId ? `<tr>
              <td style="padding:11px 16px;font-weight:600;color:#2d3748;">Linked Order</td>
              <td style="padding:11px 16px;font-family:monospace;font-size:13px;color:#4a5568;">${orderId}</td>
            </tr>` : ''}
          </table>

          <div style="background:white;border-left:4px solid #ea580c;border-radius:6px;padding:16px 20px;margin:20px 0;color:#1a202c;font-size:14px;line-height:1.65;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9a3412;letter-spacing:.05em;">User's Message</p>
            ${message.replace(/\n/g, '<br>')}
          </div>

          <a href="${adminLink}" style="display:inline-block;background:#0b1b3a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Open Admin Dashboard &rarr;
          </a>

          <p style="margin-top:28px;font-size:13px;color:#718096;">
            Go to <strong>Support</strong> in the admin dashboard to view and reply to this ticket.
            The user is waiting for your response.
          </p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="font-size:11px;color:#a0aec0;">
            Aura Payment &middot; <a href="https://aura-payment.web.app" style="color:#a0aec0;">aura-payment.web.app</a><br>
            You are receiving this because you are an active notification recipient.
          </p>
        </div>
      </div>
    `;

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    if (!user || !pass) {
      console.error('[newTicket] GMAIL_USER or GMAIL_PASS secret not available – cannot send email.');
      return;
    }

    const transporter = createTransporter(user, pass);
    await transporter.sendMail({
      from:    `"Aura Payment Support" <${user}>`,
      to:      toEmails.join(','),
      subject: emailSubject,
      html,
    });

    console.log(`[newTicket] Email sent to ${toEmails.length} recipient(s), ticket ${ticketId}`);
  }
);

// ─── Award AuraBars on Order Completion ──────────────────────────────────────
export const awardBarsOnOrderComplete = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before?.data();
  const after  = event.data?.after?.data();

  if (!before || !after) return null;
  // Only trigger when status changes TO 'completed'
  if (before.status === after.status || after.status !== 'completed') return null;

  const userId = after.userId || after.uid;
  if (!userId) return null;

  const orderId = event.params.orderId;
  const db = getFirestore();

  // Read AuraBars settings from appSettings
  const settingsSnap = await db.collection('appSettings').doc('main').get();
  const settings = settingsSnap.data() ?? {};
  const cashbackRate = settings.cashbackRate ?? 0;
  const barsSymbol   = settings.barsSymbol   ?? 'AuraBars';
  const barsEnabled  = settings.auraBarEnabled ?? false;

  if (!barsEnabled || cashbackRate <= 0) return null;

  const orderAmount = parseFloat(after.amount ?? after.sendAmount ?? 0);
  if (isNaN(orderAmount) || orderAmount <= 0) return null;

  const barsToAward = parseFloat((orderAmount * cashbackRate).toFixed(4));

  await db.runTransaction(async (tx) => {
    const walletRef = db.collection('wallets').doc(userId);
    const walletSnap = await tx.get(walletRef);

    const currentBalance = walletSnap.exists ? (walletSnap.data()?.auraBarBalance ?? 0) : 0;
    const newBalance = parseFloat((currentBalance + barsToAward).toFixed(4));

    if (walletSnap.exists) {
      tx.update(walletRef, { auraBarBalance: newBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      tx.set(walletRef, { userId, auraBarBalance: newBalance, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // Record the transaction in auraBarTransactions
    const txRef = db.collection('auraBarTransactions').doc();
    tx.set(txRef, {
      userId,
      orderId,
      type:        'cashback',
      amount:      barsToAward,
      description: `${cashbackRate * 100}% cashback on transfer — +${barsToAward} ${barsSymbol}`,
      refId:       orderId,
      balanceAfter: newBalance,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(`[awardBars] Awarded ${barsToAward} ${barsSymbol} to user ${userId} for order ${orderId}`);
  return null;
});


// ─── Gemini-powered password reset email ──────────────────────────────────────
function defaultResetEmailHtml(resetLink) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <div style="background:#0b1b3a;padding:32px 40px;text-align:center;">
        <h1 style="color:#ffffff;font-size:1.6rem;margin:0;letter-spacing:-0.3px;">Aura Payment</h1>
        <p style="color:rgba(255,255,255,0.6);font-size:0.8rem;margin:6px 0 0;letter-spacing:0.1em;text-transform:uppercase;">Security Notice</p>
      </div>
      <div style="padding:36px 40px;">
        <h2 style="color:#0b1b3a;font-size:1.25rem;margin:0 0 12px;">Reset your password</h2>
        <p style="color:#4a5568;font-size:0.95rem;line-height:1.6;margin:0 0 24px;">
          We received a request to reset the password for your Aura Payment account.
          Click the button below to create a new password. This link expires in 1 hour.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetLink}" style="display:inline-block;background:#0b1b3a;color:#ffffff;padding:14px 36px;border-radius:40px;font-size:1rem;font-weight:600;text-decoration:none;letter-spacing:0.02em;">
            Reset Password &rarr;
          </a>
        </div>
        <p style="color:#718096;font-size:0.82rem;line-height:1.6;margin:24px 0 0;padding-top:20px;border-top:1px solid #edf2f7;">
          If you didn't request this, you can safely ignore this email — your password will remain unchanged.
          For security, this link will expire in 1 hour.
        </p>
      </div>
      <div style="background:#f7fafc;padding:20px 40px;text-align:center;border-top:1px solid #edf2f7;">
        <p style="color:#a0aec0;font-size:0.78rem;margin:0;">&copy; ${new Date().getFullYear()} Aura Payment. All rights reserved.</p>
      </div>
    </div>
  `;
}

export const sendPasswordResetCustomEmail = onCall({ cors: true, secrets: ['GMAIL_USER', 'GMAIL_PASS'] }, async (request) => {
  const db   = getFirestore();
  const auth = admin.auth();

  const email = (request.data?.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('invalid-argument: A valid email address is required.');
  }

  // Verify account exists (anti-enumeration: return generic success if not found)
  try {
    await auth.getUserByEmail(email);
  } catch {
    return { success: true };
  }

  // Generate Admin SDK password reset link
  let resetLink;
  try {
    resetLink = await auth.generatePasswordResetLink(email, { url: 'https://aura-payment.web.app/signin.html' });
  } catch (err) {
    console.error('generatePasswordResetLink error:', err);
    throw new Error('internal: Could not generate reset link.');
  }

  // Read Gemini API key from Firestore appSettings
  const settingsSnap = await db.collection('appSettings').doc('main').get();
  const geminiKey = settingsSnap.data()?.geminiKey ?? '';

  let htmlBody;
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `You are writing a professional password reset email for Aura Payment, a premium fintech company.
Write a concise, warm, and professional HTML email body (no <html>/<head>/<body> tags — just the inner content).
Include:
- A short greeting
- Clear explanation that they requested a password reset
- A prominent CTA button linking to: ${resetLink}
- Security note: if they didn't request this, they can ignore it
- Professional sign-off from "The Aura Payment Team"
Use clean inline styles. Color scheme: dark navy #0b1b3a and white. Keep it short and elegant.`;
      const result = await model.generateContent(prompt);
      htmlBody = result.response.text();
    } catch (err) {
      console.warn('Gemini failed, falling back to default template:', err);
      htmlBody = defaultResetEmailHtml(resetLink);
    }
  } else {
    htmlBody = defaultResetEmailHtml(resetLink);
  }

  // Send via nodemailer (GMAIL secrets)
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  if (!gmailUser || !gmailPass) {
    console.error('[passwordReset] GMAIL_USER or GMAIL_PASS secrets not available');
    throw new Error('Email service not configured.');
  }
  const transporter = createTransporter(gmailUser, gmailPass);
  await transporter.sendMail({
    from: `"Aura Payment" <${gmailUser}>`,
    to: email,
    subject: 'Reset your Aura Payment password',
    html: htmlBody,
  });

  console.log(`[passwordReset] Reset email sent to ${email}`);
  return { success: true };
});
