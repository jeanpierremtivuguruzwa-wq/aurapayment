import {
  collection, doc, getDoc, setDoc, addDoc, increment,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export interface WalletBalance {
  currency: string
  balance: number
  updatedAt: Timestamp | null
}

export interface WalletHistoryEntry {
  id: string
  currency: string
  delta: number          // positive = credit, negative = debit
  balanceAfter?: number
  reason: string         // e.g. 'transaction', 'withdrawal', 'adjustment'
  refId?: string         // orderId, transactionId, cardholderId, etc.
  note?: string
  createdAt: Timestamp | null
}

/**
 * Apply a delta to a currency balance (creates doc if missing).
 * Also logs an entry to walletHistory.
 */
export async function updateWalletBalance(
  currency: string,
  delta: number,
  reason: string,
  refId?: string,
  note?: string,
): Promise<void> {
  const ref = doc(db, 'walletBalances', currency)
  await setDoc(ref, {
    currency,
    balance: increment(delta),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  // Read new balance for logging (best-effort)
  let balanceAfter: number | undefined
  try {
    const snap = await getDoc(ref)
    balanceAfter = snap.data()?.balance
  } catch { /* ignore */ }

  await addDoc(collection(db, 'walletHistory'), {
    currency,
    delta,
    balanceAfter: balanceAfter ?? null,
    reason,
    refId: refId ?? null,
    note: note ?? null,
    createdAt: serverTimestamp(),
  })
}

/**
 * Manually set (override) a currency balance — for admin adjustments.
 */
export async function setWalletBalance(
  currency: string,
  newBalance: number,
  adminNote: string,
): Promise<void> {
  const ref = doc(db, 'walletBalances', currency)
  const snap = await getDoc(ref)
  const prev = snap.exists() ? (snap.data()?.balance ?? 0) : 0
  const delta = newBalance - prev

  await setDoc(ref, {
    currency,
    balance: newBalance,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await addDoc(collection(db, 'walletHistory'), {
    currency,
    delta,
    balanceAfter: newBalance,
    reason: 'adjustment',
    note: adminNote || 'Manual adjustment',
    createdAt: serverTimestamp(),
  })
}
