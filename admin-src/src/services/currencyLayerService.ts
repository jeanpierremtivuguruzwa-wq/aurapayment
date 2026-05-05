import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────────────────────
// currencylayer API — all quotes are USD-based (source=USD)
// Free plan: http only.  Paid plan: https.
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_DOC = 'appSettings'
export const SETTINGS_ID  = 'main'

/** All currencies we care about fetching quotes for */
const TRACKED = ['XOF','XAF','RUB','EUR','GBP','USDT','CNY','AED','GHS','NGN']

export interface MarketQuotes {
  /** keyed as "USDXOF", "USDRUB", etc. */
  raw: Record<string, number>
  fetchedAt: number   // unix ms
}

/**
 * Fetch live quotes from currencylayer.
 * Returns raw USD-based quotes.
 */
export async function fetchMarketQuotes(apiKey: string): Promise<MarketQuotes> {
  const currencies = TRACKED.join(',')
  // Use http for free-tier keys; https for paid keys — we fall back gracefully
  const url = `https://api.currencylayer.com/live?access_key=${encodeURIComponent(apiKey)}&currencies=${currencies}&source=USD`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) {
    const msg = json.error?.info ?? JSON.stringify(json.error)
    throw new Error(msg)
  }
  return { raw: json.quotes as Record<string, number>, fetchedAt: Date.now() }
}

/**
 * Derive the cross rate from → to using USD-based quotes.
 * Formula: rate(from→to) = USDXXX[to] / USDXXX[from]
 * Special: USDT is treated as USD (rate 1:1).
 */
export function crossRate(quotes: Record<string, number>, from: string, to: string): number | null {
  const normalize = (c: string) => c === 'USDT' ? 'USD' : c
  const f = normalize(from)
  const t = normalize(to)

  const fromRate = f === 'USD' ? 1 : quotes[`USD${f}`]
  const toRate   = t === 'USD' ? 1 : quotes[`USD${t}`]

  if (!fromRate || !toRate) return null
  return toRate / fromRate
}

// ── Persist API key in Firestore (admin-only collection) ──────────────────────

export async function saveApiKey(key: string): Promise<void> {
  await setDoc(doc(db, SETTINGS_DOC, SETTINGS_ID), { currencyLayerKey: key }, { merge: true })
}

export async function loadApiKey(): Promise<string> {
  const snap = await getDoc(doc(db, SETTINGS_DOC, SETTINGS_ID))
  return (snap.data()?.currencyLayerKey as string) ?? ''
}
