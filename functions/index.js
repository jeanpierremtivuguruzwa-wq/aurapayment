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