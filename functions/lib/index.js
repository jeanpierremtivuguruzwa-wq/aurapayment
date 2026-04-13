import * as functions from "firebase-functions/v2/https";
import * as firestoreTriggers from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
admin.initializeApp();
// ─── Email notification on proof upload ────────────────────────────────────────
// Fires when an order document is updated. If the status changes to 'uploaded'
// (i.e. the client has submitted payment proof), we send an email to every
// active recipient in the notificationRecipients collection by writing to the
// `mail` collection which is consumed by the firestore-send-email extension.
export const notifyOnProofUpload = firestoreTriggers.onDocumentUpdated("orders/{orderId}", async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    // Only trigger when status transitions to 'uploaded'
    if (!before || !after)
        return null;
    if (before.status === after.status)
        return null;
    if (after.status !== "uploaded")
        return null;
    const orderId = event.params.orderId;
    const db = admin.firestore();
    // Gather active notification recipient emails
    const recipientsSnap = await db
        .collection("notificationRecipients")
        .where("active", "==", true)
        .get();
    if (recipientsSnap.empty) {
        console.log("No active notification recipients – skipping email.");
        return null;
    }
    const toEmails = recipientsSnap.docs.map((d) => d.data().email);
    // Build a readable email
    const userEmail = after.userEmail || after.userId || "unknown user";
    const amountSent = (_d = (_c = after.amountSent) !== null && _c !== void 0 ? _c : after.amount) !== null && _d !== void 0 ? _d : "?";
    const currencySent = (_f = (_e = after.sendCurrency) !== null && _e !== void 0 ? _e : after.currencySent) !== null && _f !== void 0 ? _f : "";
    const amountReceived = (_g = after.amountReceived) !== null && _g !== void 0 ? _g : "?";
    const currencyReceived = (_j = (_h = after.receiveCurrency) !== null && _h !== void 0 ? _h : after.currencyReceived) !== null && _j !== void 0 ? _j : "";
    const proofFile = after.proofFileName || "attached";
    const adminLink = "https://aura-payment.web.app/admin/";
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
              <td style="padding:10px 14px;">${amountSent} ${currencySent}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;">Amount to Receive</td>
              <td style="padding:10px 14px;">${amountReceived} ${currencyReceived}</td>
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
    // Write one mail document per recipient (or use a single doc with all addresses)
    await db.collection("mail").add({
        to: toEmails,
        message: { subject, html },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Email queued for ${toEmails.length} recipient(s) for order ${orderId}`);
    return null;
});
/**
 * Checks if the calling user has admin privileges.
 * @param {functions.CallableRequest} context - The callable function context.
 * @return {Promise<boolean>} True if the user is an admin.
 */
async function isAdmin(context) {
    var _a, _b;
    const uid = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        return false;
    const user = await admin.auth().getUser(uid);
    return ((_b = user.customClaims) === null || _b === void 0 ? void 0 : _b.role) === "admin";
}
/**
 * Lists all Firebase Auth users. Admin only.
 * @return {Promise<{users: Array<object>}>} List of users.
 */
export const listUsers = functions.onCall(async (request) => {
    if (!(await isAdmin(request))) {
        throw new functions.HttpsError("permission-denied", "Admin access required.");
    }
    const result = await admin.auth().listUsers(100);
    const users = result.users.map((user) => {
        var _a;
        return ({
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
            isAdmin: ((_a = user.customClaims) === null || _a === void 0 ? void 0 : _a.role) === "admin",
            createdAt: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
        });
    });
    return { users };
});
/**
 * Changes a user's role (admin/user). Admin only.
 * @return {Promise<{success: boolean}>} Success status.
 */
export const setUserRole = functions.onCall(async (request) => {
    if (!(await isAdmin(request))) {
        throw new functions.HttpsError("permission-denied", "Admin access required.");
    }
    const { uid, role } = request.data;
    if (!uid || (role !== "admin" && role !== "user")) {
        throw new functions.HttpsError("invalid-argument", "Invalid uid or role.");
    }
    const claims = role === "admin" ? { role: "admin" } : null;
    await admin.auth().setCustomUserClaims(uid, claims);
    return { success: true };
});
/**
 * Lists recent transactions from Firestore. Admin only.
 * @return {Promise<{transactions: Array<object>}>} List of transactions.
 */
export const listTransactions = functions.onCall(async (request) => {
    if (!(await isAdmin(request))) {
        throw new functions.HttpsError("permission-denied", "Admin access required.");
    }
    const snapshot = await admin.firestore()
        .collection("transactions")
        .orderBy("timestamp", "desc")
        .limit(200)
        .get();
    const transactions = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
    return { transactions };
});
//# sourceMappingURL=index.js.map