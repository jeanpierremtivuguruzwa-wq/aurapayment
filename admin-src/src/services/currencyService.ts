import {
  collection, doc, updateDoc, addDoc, deleteDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { CurrencyPair } from '../types/CurrencyPair'

export async function updateCurrencyPair(id: string, data: Partial<CurrencyPair>) {
  await updateDoc(doc(db, 'currencyPairs', id), data)
}

export async function addCurrencyPair(pair: Omit<CurrencyPair, 'id'>) {
  await addDoc(collection(db, 'currencyPairs'), pair)
}

export async function deleteCurrencyPair(id: string) {
  await deleteDoc(doc(db, 'currencyPairs', id))
}

export async function deactivateAllPairs(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'currencyPairs'), where('active', '==', true)))
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { active: false })))
  return snap.size
}

// ── Rate History ─────────────────────────────────────────────────────────────

export interface RateHistoryEntry {
  id: string
  pairId: string
  from: string
  to: string
  country?: string
  countryCode?: string
  flag?: string
  oldRate: number
  newRate: number
  changedAt: Timestamp | null
  changedBy: string
}

export async function logRateChange(
  pair: CurrencyPair,
  oldRate: number,
  newRate: number,
  changedBy = 'admin',
): Promise<void> {
  await addDoc(collection(db, 'rateHistory'), {
    pairId: pair.id,
    from: pair.from,
    to: pair.to,
    country: pair.country ?? null,
    countryCode: pair.countryCode ?? null,
    flag: pair.flag ?? null,
    oldRate,
    newRate,
    changedAt: serverTimestamp(),
    changedBy,
  })
}

export async function getRateHistory(pairId: string): Promise<RateHistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'rateHistory'),
      where('pairId', '==', pairId),
      orderBy('changedAt', 'desc'),
      limit(20),
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RateHistoryEntry))
  } catch {
    // Index may not exist yet; fall back to unordered fetch
    const snap = await getDocs(
      query(collection(db, 'rateHistory'), where('pairId', '==', pairId), limit(20)),
    )
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as RateHistoryEntry))
      .sort((a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0))
  }
}
