import * as functions from "firebase-functions/v2/https";
import * as firestoreTriggers from "firebase-functions/v2/firestore";
import * as scheduler from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();

// ─── Auto-sync currency rates from currencylayer ──────────────────────────────
// Runs every hour. Reads the API key + per-pair spread from Firestore, fetches
// live USD-based quotes, computes cross rates, and writes the result back to
// each active currencyPair document so the public dashboard stays up to date.

const TRACKED_CURRENCIES = [
  "XOF","XAF","RUB","EUR","GBP","CNY","AED","GHS","NGN","USD",
];

function crossRate(
  quotes: Record<string, number>,
  from: string,
  to: string
): number | null {
  const norm = (c: string) => (c === "USDT" ? "USD" : c);
  const f = norm(from);
  const t = norm(to);
  const fromRate = f === "USD" ? 1 : quotes[`USD${f}`];
  const toRate   = t === "USD" ? 1 : quotes[`USD${t}`];
  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}

export const syncCurrencyRates = scheduler.onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "UTC",
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();

    // 1. Load API key
    const settingsSnap = await db.collection("appSettings").doc("main").get();
    const apiKey = (settingsSnap.data()?.currencyLayerKey as string) ?? "";
    if (!apiKey) {
      console.log("syncCurrencyRates: no API key set — skipping.");
      return;
    }

    // 2. Fetch live quotes from currencylayer
    const currencies = TRACKED_CURRENCIES.join(",");
    const url = `https://api.currencylayer.com/live?access_key=${encodeURIComponent(apiKey)}&currencies=${currencies}&source=USD`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`syncCurrencyRates: HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as {
      success: boolean;
      quotes?: Record<string, number>;
      error?: { info?: string };
    };
    if (!json.success || !json.quotes) {
      console.error("syncCurrencyRates: API error —", json.error?.info);
      return;
    }
    const quotes = json.quotes;
    console.log(`syncCurrencyRates: fetched ${Object.keys(quotes).length} quotes`);

    // 3. Load all active pairs
    const pairsSnap = await db
      .collection("currencyPairs")
      .where("active", "==", true)
      .get();

    const batch = db.batch();
    let updated = 0;
    let skipped = 0;

    for (const doc of pairsSnap.docs) {
      const pair = doc.data() as {
        from: string;
        to: string;
        rate: number;
        spread?: number;
        spreadType?: "flat" | "percent";
      };

      const market = crossRate(quotes, pair.from, pair.to);
      if (market == null) {
        skipped++;
        continue;
      }

      const spread     = pair.spread ?? 0;
      const spreadType = pair.spreadType ?? "flat";
      const newRate    = parseFloat(
        (spreadType === "percent"
          ? market * (1 - spread / 100)
          : market - spread
        ).toFixed(6)
      );

      if (newRate <= 0) { skipped++; continue; }

      batch.update(doc.ref, {
        rate:      newRate,
        syncedAt:  admin.firestore.FieldValue.serverTimestamp(),
        syncSource: "currencylayer",
      });
      updated++;
    }

    await batch.commit();
    console.log(
      `syncCurrencyRates: updated=${updated}, skipped=${skipped}`
    );
  }
);

// ─── Email notification on proof upload ────────────────────────────────────────
// Fires when an order document is updated. If the status changes to 'uploaded'
// (i.e. the client has submitted payment proof), we send an email to every
// active recipient in the notificationRecipients collection by writing to the
// `mail` collection which is consumed by the firestore-send-email extension.
export const notifyOnProofUpload = firestoreTriggers.onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Only trigger when status transitions to 'uploaded'
    if (!before || !after) return null;
    if (before.status === after.status) return null;
    if (after.status !== "uploaded") return null;

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

    const toEmails: string[] = recipientsSnap.docs.map(
      (d) => d.data().email as string
    );

    // Build a readable email
    const userEmail = after.userEmail || after.userId || "unknown user";
    const amountSent = after.amountSent ?? after.amount ?? "?";
    const currencySent = after.sendCurrency ?? after.currencySent ?? "";
    const amountReceived = after.amountReceived ?? "?";
    const currencyReceived = after.receiveCurrency ?? after.currencyReceived ?? "";
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
  }
);

// ─── Email notification on NEW order ──────────────────────────────────────────
// Fires when a new order document is created. Sends an email to every active
// recipient in the notificationRecipients collection.
export const notifyOnNewOrder = firestoreTriggers.onDocumentCreated(
  "orders/{orderId}",
  async (event) => {
    const order = event.data?.data();
    if (!order) return null;

    const orderId = event.params.orderId;
    const db = admin.firestore();

    // Gather active notification recipient emails
    const recipientsSnap = await db
      .collection("notificationRecipients")
      .where("active", "==", true)
      .get();

    if (recipientsSnap.empty) {
      console.log("[newOrder] No active notification recipients – skipping.");
      return null;
    }

    const toEmails: string[] = recipientsSnap.docs.map((d) => d.data().email as string);

    // Order details
    const userEmail = order.userEmail || order.userId || "unknown";
    const senderName = order.senderName || order.recipientName || "";
    const sendAmount = order.sendAmount ?? order.amount ?? "?";
    const sendCurrency = order.sendCurrency ?? "";
    const receiveAmount = order.receiveAmount ?? order.amountReceived ?? "?";
    const receiveCurrency = order.receiveCurrency ?? "";
    const paymentMethod = order.paymentMethod || order.provider || "—";
    const deliveryMethod = order.deliveryMethod || "—";
    const adminLink = "https://aura-payment.web.app/admin/";

    const subject = `🆕 New Order Received – ${sendAmount} ${sendCurrency}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">New Order Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <h2 style="margin-top:0;color:#0b1b3a;">A new order has just been placed</h2>
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
            ${senderName ? `<tr style="background:#edf2f7;">
              <td style="padding:10px 14px;font-weight:600;">Sender Name</td>
              <td style="padding:10px 14px;">${senderName}</td>
            </tr>` : ""}
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
            Open Admin Dashboard →
          </a>

          <p style="margin-top:32px;font-size:13px;color:#718096;">
            Go to <strong>Orders</strong> in the admin dashboard to process this order.
            The client is waiting for you to provide payment instructions.
          </p>
        </div>
      </div>
    `;

    await db.collection("mail").add({
      to: toEmails,
      message: {subject, html},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[newOrder] Email queued for ${toEmails.length} recipient(s), order ${orderId}`);
    return null;
  }
);

/**
 * Checks if the calling user has admin privileges.
 * @param {functions.CallableRequest} context - The callable function context.
 * @return {Promise<boolean>} True if the user is an admin.
 */
async function isAdmin(context: functions.CallableRequest) {
  const uid = context.auth?.uid;
  if (!uid) return false;
  const user = await admin.auth().getUser(uid);
  return user.customClaims?.role === "admin";
}

/**
 * Lists all Firebase Auth users. Admin only.
 * @return {Promise<{users: Array<object>}>} List of users.
 */
export const listUsers = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError(
      "permission-denied",
      "Admin access required."
    );
  }

  const result = await admin.auth().listUsers(100);
  const users = result.users.map((user) => ({
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    isAdmin: user.customClaims?.role === "admin",
    createdAt: user.metadata.creationTime,
    lastSignInTime: user.metadata.lastSignInTime,
  }));
  return {users};
});

/**
 * Changes a user's role (admin/user). Admin only.
 * @return {Promise<{success: boolean}>} Success status.
 */
export const setUserRole = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError(
      "permission-denied",
      "Admin access required."
    );
  }

  const {uid, role} = request.data;
  if (!uid || (role !== "admin" && role !== "user")) {
    throw new functions.HttpsError(
      "invalid-argument",
      "Invalid uid or role."
    );
  }

  const claims = role === "admin" ? {role: "admin"} : null;
  await admin.auth().setCustomUserClaims(uid, claims);
  return {success: true};
});

/**
 * Lists recent transactions from Firestore. Admin only.
 * @return {Promise<{transactions: Array<object>}>} List of transactions.
 */
export const listTransactions = functions.onCall(async (request) => {
  if (!(await isAdmin(request))) {
    throw new functions.HttpsError(
      "permission-denied",
      "Admin access required."
    );
  }

  const snapshot = await admin.firestore()
    .collection("transactions")
    .orderBy("timestamp", "desc")
    .limit(200)
    .get();

  const transactions = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return {transactions};
});

// ─── Email user when order is completed or cancelled ───────────────────────────
// Fires on every order update. When status transitions to 'completed' or
// 'cancelled', sends a confirmation email directly to the client's email.
export const notifyUserOnOrderComplete = firestoreTriggers.onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();

    if (!before || !after) return null;
    if (before.status === after.status) return null;
    if (after.status !== "completed" && after.status !== "cancelled") return null;

    const userEmail = after.userEmail as string | undefined;
    if (!userEmail) {
      console.log("[orderComplete] No userEmail on order – skipping.");
      return null;
    }

    const orderId       = event.params.orderId;
    const db            = admin.firestore();
    const isCompleted   = after.status === "completed";

    const senderName     = after.senderName     || after.recipientName || "";
    const sendAmount     = after.sendAmount      ?? after.amount        ?? "?";
    const sendCurrency   = after.sendCurrency    ?? "";
    const receiveAmount  = after.receiveAmount   ?? after.amountReceived ?? "?";
    const receiveCurrency = after.receiveCurrency ?? "";
    const paymentMethod  = after.paymentMethod   || "—";
    const deliveryMethod = after.deliveryMethod  || "—";
    const historyLink    = "https://aura-payment.web.app/history.html";

    // ── Completed email template ────────────────────────────────────────────
    const completedHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Transaction Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:10px;padding:20px 24px;margin-bottom:28px;display:flex;align-items:center;gap:16px;">
            <span style="font-size:36px;">✅</span>
            <div>
              <h2 style="margin:0;color:#276749;font-size:20px;">Transaction Completed!</h2>
              <p style="margin:4px 0 0;color:#48bb78;font-size:14px;">Your money is on its way</p>
            </div>
          </div>
          <p style="color:#4a5568;">
            Hi${senderName ? " " + senderName : ""},<br>
            Great news! Your transaction has been <strong style="color:#276749;">successfully completed</strong>.
            Your funds have been processed and sent. Here's a summary of your order:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden;">
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;width:45%;color:#2d3748;">Order ID</td>
              <td style="padding:12px 16px;font-family:monospace;font-size:13px;color:#4a5568;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">You Sent</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#0b1b3a;">${sendAmount} ${sendCurrency}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">You Receive</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#276749;">${receiveAmount} ${receiveCurrency}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">Payment Method</td>
              <td style="padding:12px 16px;color:#4a5568;">${paymentMethod}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">Delivery Method</td>
              <td style="padding:12px 16px;color:#4a5568;">${deliveryMethod}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">Status</td>
              <td style="padding:12px 16px;">
                <span style="background:#c6f6d5;color:#276749;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">✓ Completed</span>
              </td>
            </tr>
          </table>
          <a href="${historyLink}" style="display:inline-block;background:#276749;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            View Transaction History →
          </a>
          <p style="margin-top:28px;font-size:13px;color:#718096;">
            If you have any questions or concerns, please visit our <a href="https://aura-payment.web.app/support.html" style="color:#0b1b3a;">support page</a>.
            Thank you for using Aura Payment! 🎉
          </p>
        </div>
      </div>`;

    // ── Cancelled email template ────────────────────────────────────────────
    const cancelledHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a202c;">
        <div style="background:#0b1b3a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">Aura Payment</h1>
          <p style="color:#90cdf4;margin:4px 0 0;font-size:14px;">Transaction Notification</p>
        </div>
        <div style="background:#f7fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:10px;padding:20px 24px;margin-bottom:28px;display:flex;align-items:center;gap:16px;">
            <span style="font-size:36px;">❌</span>
            <div>
              <h2 style="margin:0;color:#c53030;font-size:20px;">Transaction Cancelled</h2>
              <p style="margin:4px 0 0;color:#fc8181;font-size:14px;">Your order has been cancelled</p>
            </div>
          </div>
          <p style="color:#4a5568;">
            Hi${senderName ? " " + senderName : ""},<br>
            We're writing to inform you that your transaction has been <strong style="color:#c53030;">cancelled</strong>.
            If you believe this was a mistake or need assistance, please contact our support team.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden;">
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;width:45%;color:#2d3748;">Order ID</td>
              <td style="padding:12px 16px;font-family:monospace;font-size:13px;color:#4a5568;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">You Sent</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#0b1b3a;">${sendAmount} ${sendCurrency}</td>
            </tr>
            <tr style="background:#edf2f7;">
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">Was to Receive</td>
              <td style="padding:12px 16px;font-size:17px;font-weight:700;color:#4a5568;">${receiveAmount} ${receiveCurrency}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#2d3748;">Status</td>
              <td style="padding:12px 16px;">
                <span style="background:#fed7d7;color:#c53030;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">✗ Cancelled</span>
              </td>
            </tr>
          </table>
          <a href="https://aura-payment.web.app/support.html" style="display:inline-block;background:#c53030;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Contact Support →
          </a>
          <p style="margin-top:28px;font-size:13px;color:#718096;">
            If you'd like to place a new order, please visit <a href="https://aura-payment.web.app/send-money.html" style="color:#0b1b3a;">aura-payment.web.app</a>.
            We apologise for any inconvenience caused.
          </p>
        </div>
      </div>`;

    const subject = isCompleted
      ? `✅ Transaction Completed – Order ${orderId}`
      : `❌ Transaction Cancelled – Order ${orderId}`;

    const html = isCompleted ? completedHtml : cancelledHtml;

    await db.collection("mail").add({
      to:      [userEmail],
      message: { subject, html },
      type:    isCompleted ? "order_completed" : "order_cancelled",
      orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[orderComplete] Email queued → ${userEmail}, order ${orderId}, status: ${after.status}`);
    return null;
  }
);

// ─── Email user when support agent/admin replies to their ticket ───────────────
// Fires when a new message is created in supportTickets/{ticketId}/messages/.
// If the message role is 'admin' or 'agent', we email the user so they know
// the support team has replied and they should visit the support page.
export const notifyUserOnSupportReply = firestoreTriggers.onDocumentCreated(
  "supportTickets/{ticketId}/messages/{messageId}",
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return null;

    // Only send when admin or agent replies – never on user messages
    if (msg.role === "user") return null;

    const ticketId = event.params.ticketId;
    const db = admin.firestore();

    // Fetch parent ticket to get user's email and details
    const ticketSnap = await db.collection("supportTickets").doc(ticketId).get();
    if (!ticketSnap.exists) {
      console.log(`[supportReply] Ticket ${ticketId} not found – skipping.`);
      return null;
    }

    const ticket = ticketSnap.data()!;
    const userEmail = ticket.userEmail as string | undefined;
    if (!userEmail) {
      console.log(`[supportReply] No userEmail on ticket ${ticketId} – skipping.`);
      return null;
    }

    const userName    = (ticket.userName as string) || "";
    const subjectKey  = (ticket.subject as string) || "general";
    const replyText   = (msg.text as string) || "";
    const senderName  = (msg.senderName as string) || "Support Team";
    const supportLink = "https://aura-payment.web.app/support.html";

    const CATEGORY: Record<string, string> = {
      transaction_delay: "Transaction taking too long",
      proof_issue:       "Problem with proof of payment",
      wrong_amount:      "Wrong amount received",
      payment_failed:    "Payment failed",
      account_issue:     "Account issue",
      general:           "General question",
      other:             "Other",
    };
    const topicLabel = CATEGORY[subjectKey] || subjectKey;

    const emailSubject = `Reply from Aura Support – ${topicLabel}`;

    const html = `
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
            Hi${userName ? " " + userName : ""},<br><br>
            Our support team has replied to your enquiry. Here is their message:
          </p>

          <div style="background:white;border-left:4px solid #0b1b3a;border-radius:6px;padding:18px 22px;margin:20px 0;color:#1a202c;font-size:15px;line-height:1.6;">
            ${replyText.replace(/\n/g, "<br>")}
          </div>

          <p style="color:#718096;font-size:14px;">
            — <strong style="color:#0b1b3a;">${senderName}</strong>, Aura Payment Support
          </p>

          <a href="${supportLink}" style="display:inline-block;margin-top:8px;background:#0b1b3a;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            View Your Support Ticket →
          </a>

          <p style="margin-top:28px;font-size:13px;color:#718096;">
            You can reply directly from the <a href="${supportLink}" style="color:#0b1b3a;font-weight:600;">support page</a>
            on our website. Our team is here to help and your issue is being handled.<br><br>
            Thank you for your patience.
          </p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="font-size:11px;color:#a0aec0;">
            Aura Payment · <a href="https://aura-payment.web.app" style="color:#a0aec0;">aura-payment.web.app</a><br>
            This email was sent because you submitted a support request. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    await db.collection("mail").add({
      to:      [userEmail],
      message: { subject: emailSubject, html },
      type:    "support_reply",
      ticketId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[supportReply] Email queued → ${userEmail}, ticket ${ticketId}`);
    return null;
  }
);
