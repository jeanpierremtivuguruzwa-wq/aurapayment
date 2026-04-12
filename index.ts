import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Helper: check if the caller is an admin
async function isAdmin(context: functions.CallableRequest) {
  const uid = context.auth?.uid;
  if (!uid) return false;
  const user = await admin.auth().getUser(uid);
  return user.customClaims?.role === 'admin';
}

// 📋 List all users (admin only)
export const listUsers = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError('permission-denied', 'Admin access required.');
  }

  const result = await admin.auth().listUsers(100);
  const users = result.users.map((user) => ({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    isAdmin: user.customClaims?.role === 'admin',
    createdAt: user.metadata.creationTime,
  }));
  return { users };
});

// 👑 Change user role (admin only)
export const setUserRole = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError('permission-denied', 'Admin access required.');
  }

  const { uid, role } = request.data;
  if (!uid || (role !== 'admin' && role !== 'user')) {
    throw new functions.HttpsError('invalid-argument', 'Invalid uid or role.');
  }

  const claims = role === 'admin' ? { role: 'admin' } : null;
  await admin.auth().setCustomUserClaims(uid, claims);
  return { success: true };
});

// 💰 List all transactions (admin only)
export const listTransactions = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError('permission-denied', 'Admin access required.');
  }

  const snapshot = await admin.firestore()
    .collection('transactions')
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get();

  const transactions = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return { transactions };
});
