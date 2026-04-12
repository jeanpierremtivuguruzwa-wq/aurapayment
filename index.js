import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase client config (optional, for client SDK features)
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

// Initialize Firebase Admin (for backend operations)
admin.initializeApp({
  projectId: "aura-payment",
  // If running locally, you may need a service account key.
  // For simplicity, use default credentials if you have set GOOGLE_APPLICATION_CREDENTIALS.
  // Otherwise, you can pass a credential object.
});
const db = getFirestore();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Example route: get all transactions for a user (authenticate via Firebase ID token)
app.post('/api/transactions', async (req, res) => {
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));