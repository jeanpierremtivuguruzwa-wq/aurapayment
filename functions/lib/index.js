"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTransactions = exports.setUserRole = exports.listUsers = void 0;
const functions = __importStar(require("firebase-functions/v2/https"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
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
exports.listUsers = functions.onCall(async (request) => {
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
exports.setUserRole = functions.onCall(async (request) => {
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
exports.listTransactions = functions.onCall(async (request) => {
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