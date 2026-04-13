import { collection, doc, updateDoc, addDoc, deleteDoc, getDocs } from 'firebase/firestore'
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

// ── Seed defaults ───────────────────────────────────────────────────────────
// Bidirectional: RUB→XOF/XAF  AND  XOF/XAF→RUB for every country.
// Uniqueness: from + to + countryCode (direction matters).

type SeedPair = Omit<CurrencyPair, 'id'>

function makePair(
  from: string, to: string,
  country: string, countryCode: string, flag: string,
  rate: number
): SeedPair {
  return { from, to, country, countryCode, flag, rate, urgent: false, active: true, deliveryMethods: ['Bank Transfer', 'Cash Pickup'] }
}

function both(localCurrency: string, country: string, countryCode: string, flag: string, rubRate: number): SeedPair[] {
  const inv = parseFloat((1 / rubRate).toFixed(6))
  return [
    makePair('RUB',          localCurrency, country, countryCode, flag, rubRate),
    makePair(localCurrency,  'RUB',         country, countryCode, flag, inv),
  ]
}

const DEFAULT_PAIRS: SeedPair[] = [
  // ── XOF zone (West African CFA) ────────────────────────────────────
  ...both('XOF', 'Senegal',        'SN', '🇸🇳', 7.25),
  ...both('XOF', "Côte d'Ivoire",  'CI', '🇨🇮', 7.20),
  ...both('XOF', 'Mali',           'ML', '🇲🇱', 7.15),
  ...both('XOF', 'Burkina Faso',   'BF', '🇧🇫', 7.10),
  ...both('XOF', 'Guinea-Bissau',  'GW', '🇬🇼', 7.05),
  ...both('XOF', 'Niger',          'NE', '🇳🇪', 7.00),
  ...both('XOF', 'Togo',           'TG', '🇹🇬', 7.18),
  ...both('XOF', 'Benin',          'BJ', '🇧🇯', 7.12),
  // ── XAF zone (Central African CFA) ──────────────────────────────
  ...both('XAF', 'Cameroon',              'CM', '🇨🇲', 7.30),
  ...both('XAF', 'Central African Rep.',  'CF', '🇨🇫', 7.08),
  ...both('XAF', 'Chad',                  'TD', '🇹🇩', 7.02),
  ...both('XAF', 'Republic of Congo',     'CG', '🇨🇬', 7.22),
  ...both('XAF', 'Equatorial Guinea',     'GQ', '🇬🇶', 7.17),
  ...both('XAF', 'Gabon',                 'GA', '🇬🇦', 7.28),
]

export async function seedDefaultPairs(): Promise<{ added: number; skipped: number }> {
  const snap = await getDocs(collection(db, 'currencyPairs'))
  const existing = snap.docs.map(d => d.data())

  let added = 0
  let skipped = 0

  for (const pair of DEFAULT_PAIRS) {
    const already = existing.some(
      e => e.from === pair.from && e.to === pair.to && e.countryCode === pair.countryCode
    )
    if (already) { skipped++; continue }
    await addDoc(collection(db, 'currencyPairs'), pair)
    added++
  }

  return { added, skipped }
}


// ── Seed defaults ─────────────────────────────────────────────────────────────
// All XOF-zone and XAF-zone countries paired with RUB.
// Only inserts pairs that don't already exist (matched by from+to+countryCode).

const DEFAULT_PAIRS: Omit<CurrencyPair, 'id'>[] = [
  // ── RUB → XOF (West African CFA) ────────────────────────────────────────
  { from: 'RUB', to: 'XOF', country: 'Senegal',       countryCode: 'SN', flag: '🇸🇳', rate: 7.25,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: "Côte d'Ivoire", countryCode: 'CI', flag: '🇨🇮', rate: 7.20,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Mali',           countryCode: 'ML', flag: '🇲🇱', rate: 7.15,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Burkina Faso',   countryCode: 'BF', flag: '🇧🇫', rate: 7.10,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Guinea-Bissau',  countryCode: 'GW', flag: '🇬🇼', rate: 7.05,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Niger',          countryCode: 'NE', flag: '🇳🇪', rate: 7.00,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Togo',           countryCode: 'TG', flag: '🇹🇬', rate: 7.18,  urgent: false, active: true },
  { from: 'RUB', to: 'XOF', country: 'Benin',          countryCode: 'BJ', flag: '🇧🇯', rate: 7.12,  urgent: false, active: true },
  // ── RUB → XAF (Central African CFA) ─────────────────────────────────────
  { from: 'RUB', to: 'XAF', country: 'Cameroon',              countryCode: 'CM', flag: '🇨🇲', rate: 7.30,  urgent: false, active: true },
  { from: 'RUB', to: 'XAF', country: 'Central African Rep.',  countryCode: 'CF', flag: '🇨🇫', rate: 7.08,  urgent: false, active: true },
  { from: 'RUB', to: 'XAF', country: 'Chad',                  countryCode: 'TD', flag: '🇹🇩', rate: 7.02,  urgent: false, active: true },
  { from: 'RUB', to: 'XAF', country: 'Republic of Congo',     countryCode: 'CG', flag: '🇨🇬', rate: 7.22,  urgent: false, active: true },
  { from: 'RUB', to: 'XAF', country: 'Equatorial Guinea',     countryCode: 'GQ', flag: '🇬🇶', rate: 7.17,  urgent: false, active: true },
  { from: 'RUB', to: 'XAF', country: 'Gabon',                 countryCode: 'GA', flag: '🇬🇦', rate: 7.28,  urgent: false, active: true },
]

export async function seedDefaultPairs(): Promise<{ added: number; skipped: number }> {
  const snap = await getDocs(collection(db, 'currencyPairs'))
  const existing = snap.docs.map(d => d.data())

  let added = 0
  let skipped = 0

  for (const pair of DEFAULT_PAIRS) {
    const already = existing.some(
      e => e.from === pair.from && e.to === pair.to && e.countryCode === pair.countryCode
    )
    if (already) { skipped++; continue }
    await addDoc(collection(db, 'currencyPairs'), pair)
    added++
  }

  return { added, skipped }
}
