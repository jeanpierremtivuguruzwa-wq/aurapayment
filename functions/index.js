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

// ---------- Secret for Gemini API ----------
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// ---------- Express API (mounted as a Cloud Function) ----------
const apiApp = express();
apiApp.use(helmet());
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// Example route: get transactions for a user
apiApp.post('/transactions', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const snapshot = await db.collection('transactions').where('userId', '==', userId).get();
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