import React, { useEffect, useState, useMemo } from 'react'
import {
  collection, onSnapshot, orderBy, query, limit, Timestamp,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import { setWalletBalance } from '../../services/walletService'
import {
  Wallet, CreditCard, AlertTriangle, TrendingUp,
  Pencil, Check, History, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft,
  RefreshCw, ShieldCheck,
} from 'lucide-react'

// ── Wallet balance doc (one per currency in walletBalances collection) ────────
interface WalletBalance {
  currency: string
  balance: number
  updatedAt: Timestamp | null
}

// ── Wallet history entry ──────────────────────────────────────────────────────
interface WalletHistoryEntry {
  id: string
  currency: string
  delta: number
  balanceAfter?: number
  reason: string
  refId?: string
  note?: string
  createdAt: Timestamp | null
}

// ── Currency metadata ─────────────────────────────────────────────────────────
const CURRENCY_META: Record<string, { flag: string; label: string; symbol: string }> = {
  RUB: { flag: '🇷🇺', label: 'Russian Ruble',       symbol: '₽' },
  XOF: { flag: '🌍', label: 'West Africa CFA',       symbol: 'CFA' },
  XAF: { flag: '🌍', label: 'Central Africa CFA',    symbol: 'FCFA' },
  USD: { flag: '🇺🇸', label: 'US Dollar',            symbol: '$' },
  EUR: { flag: '🇪🇺', label: 'Euro',                  symbol: '€' },
  GBP: { flag: '🇬🇧', label: 'British Pound',         symbol: '£' },
  AED: { flag: '🇦🇪', label: 'UAE Dirham',            symbol: 'د.إ' },
  CNY: { flag: '🇨🇳', label: 'Chinese Yuan',          symbol: '¥' },
  TRY: { flag: '🇹🇷', label: 'Turkish Lira',          symbol: '₺' },
  INR: { flag: '🇮🇳', label: 'Indian Rupee',          symbol: '₹' },
}
const meta = (code: string) =>
  CURRENCY_META[code] ?? { flag: '💱', label: code, symbol: code }
const fmt = (n: number, symbol: string) =>
  `${symbol} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (ts: Timestamp | null): string => {
  if (!ts) return '—'
  try {
    return ts.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

// ── Cardholder types (for breakdown section) ──────────────────────────────────
interface CardholderRow extends Cardholder {
  paymentMethodName: string
  pmTotalReceived: number
  computedBalance: number
}
interface CurrencyGroup {
  currency: string
  total: number
  totalReceived: number
  totalWithdrawn: number
  cardholders: CardholderRow[]
  hasActiveMethod: boolean
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EDIT BALANCE MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EditBalanceModal({
  currency,
  current,
  onClose,
}: {
  currency: string
  current: number
  onClose: () => void
}) {
  const m = meta(currency)
  const [value, setValue] = useState(current.toFixed(2))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) { setError('Please enter a valid number.'); return }
    if (!note.trim()) { setError('Please add a note for audit trail.'); return }
    setSaving(true)
    try {
      await setWalletBalance(currency, parsed, note.trim())
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" /> Edit Balance
            </h3>
            <p className="text-xs text-gray-500 mt-1">{m.flag} {currency} — {m.label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">New Balance ({m.symbol})</label>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-400 mt-1">
              Current: <span className="font-medium text-gray-600">{fmt(current, m.symbol)}</span>
              {parseFloat(value) !== current && !isNaN(parseFloat(value)) && (
                <span className={`ml-2 font-semibold ${parseFloat(value) > current ? 'text-emerald-600' : 'text-red-500'}`}>
                  {parseFloat(value) > current ? '+' : ''}{fmt(parseFloat(value) - current, m.symbol)}
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason / Note <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Manual reconciliation, Bank transfer received…"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Balance'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WALLET CURRENCY CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function WalletCard({
  balance,
  history,
  isAdmin,
  onEdit,
}: {
  balance: WalletBalance
  history: WalletHistoryEntry[]
  isAdmin: boolean
  onEdit: () => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const m = meta(balance.currency)
  const bal = balance.balance ?? 0
  const isNeg = bal < 0
  const isLow = !isNeg && bal < 500
  const statusColor = isNeg ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'
  const statusBg = isNeg ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'

  // Last 10 history entries for this currency
  const currencyHistory = history.filter(h => h.currency === balance.currency).slice(0, 10)
  const totalIn  = currencyHistory.filter(h => h.delta > 0).reduce((s, h) => s + h.delta, 0)
  const totalOut = currencyHistory.filter(h => h.delta < 0).reduce((s, h) => s + h.delta, 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Currency identity */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${statusBg}`}>
              {m.flag}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-lg">{balance.currency}</h3>
                {isNeg && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                    <AlertTriangle className="w-3 h-3" /> Negative
                  </span>
                )}
                {isLow && !isNeg && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">Low</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{m.label}</p>
            </div>
          </div>

          {/* Balance + admin edit */}
          <div className="flex flex-col items-end gap-2">
            <p className={`text-2xl font-bold ${statusColor}`}>{fmt(bal, m.symbol)}</p>
            {isAdmin && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 font-medium transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Recent 10-entry totals */}
        {currencyHistory.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-gray-600">Received: <strong className="text-emerald-600">{fmt(totalIn, m.symbol)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-red-400" />
              <span className="text-xs text-gray-600">Sent: <strong className="text-red-500">{fmt(Math.abs(totalOut), m.symbol)}</strong></span>
            </div>
            <span className="ml-auto text-xs text-gray-400">last {currencyHistory.length} transactions</span>
          </div>
        )}

        {/* History toggle */}
        {currencyHistory.length > 0 && (
          <button
            onClick={() => setShowHistory(v => !v)}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
          >
            <History className="w-3.5 h-3.5" />
            {showHistory ? 'Hide history' : 'Show transaction history'}
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* History entries */}
      {showHistory && currencyHistory.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-2 bg-gray-50">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recent Activity</span>
          </div>
          <div className="divide-y divide-gray-50">
            {currencyHistory.map(entry => {
              const isCredit = entry.delta > 0
              return (
                <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCredit ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {isCredit
                      ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                      : <ArrowUpRight  className="w-3.5 h-3.5 text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {entry.note || entry.reason}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(entry.createdAt)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isCredit ? '+' : ''}{fmt(entry.delta, m.symbol)}
                    </p>
                    {entry.balanceAfter !== undefined && (
                      <p className="text-[10px] text-gray-400">bal: {fmt(entry.balanceAfter, m.symbol)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const AuraWallet: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  // Business wallet balances (walletBalances collection)
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([])
  const [walletHistory, setWalletHistory] = useState<WalletHistoryEntry[]>([])

  // Cardholder data (secondary section)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [cardholders, setCardholders] = useState<Cardholder[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Live wallet balances (business treasury)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'walletBalances'), snap => {
      setWalletBalances(snap.docs.map(d => ({ currency: d.id, ...d.data() } as WalletBalance)))
    })
    return unsub
  }, [])

  // Live wallet history (last 100 entries, newest first)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'walletHistory'), orderBy('createdAt', 'desc'), limit(100)),
      snap => {
        setWalletHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletHistoryEntry)))
      },
      () => {}
    )
    return unsub
  }, [])

  // Live payment methods
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'paymentMethods'), snap => {
      setMethods(snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)))
    })
    return unsub
  }, [])

  // Live cardholders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cardholders'), snap => {
      setCardholders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cardholder)))
      setLoading(false)
    })
    return unsub
  }, [])

  // Build cardholder currency groups
  const groups: CurrencyGroup[] = useMemo(() => {
    const methodMap: Record<string, PaymentMethod> = {}
    for (const m of methods) methodMap[m.id] = m
    const currencyMap: Record<string, CurrencyGroup> = {}

    for (const pm of methods) {
      if (!pm.active) continue
      if (!currencyMap[pm.currency]) {
        currencyMap[pm.currency] = { currency: pm.currency, total: 0, totalReceived: 0, totalWithdrawn: 0, cardholders: [], hasActiveMethod: true }
      }
    }
    for (const ch of cardholders) {
      const pm = methodMap[ch.paymentMethodId]
      if (!pm) continue
      if (!currencyMap[pm.currency]) {
        currencyMap[pm.currency] = { currency: pm.currency, total: 0, totalReceived: 0, totalWithdrawn: 0, cardholders: [], hasActiveMethod: false }
      }
      const received  = pm.totalReceived  ?? 0
      const withdrawn = ch.totalWithdrawn ?? 0
      const balance   = received - withdrawn
      currencyMap[pm.currency].totalReceived  += received
      currencyMap[pm.currency].totalWithdrawn += withdrawn
      currencyMap[pm.currency].total          += balance
      currencyMap[pm.currency].cardholders.push({
        ...ch, paymentMethodName: pm.name, pmTotalReceived: received, computedBalance: balance,
      })
    }
    return Object.values(currencyMap).sort((a, b) => {
      if (a.hasActiveMethod !== b.hasActiveMethod) return a.hasActiveMethod ? -1 : 1
      return b.total - a.total
    })
  }, [methods, cardholders])

  // Sort wallet balances by abs value descending
  const sortedBalances = [...walletBalances].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  const editingBalance = walletBalances.find(b => b.currency === editingCurrency)

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-600" /> AuraWallet
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Business treasury — real-time balance per currency, auto-updated by every transaction
          </p>
        </div>
        {isAdmin && (
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin access
          </span>
        )}
      </div>

      {/* ── Summary banner ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Currencies</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{sortedBalances.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Positive</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {sortedBalances.filter(b => b.balance > 0).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Negative</p>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {sortedBalances.filter(b => b.balance < 0).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Cardholders</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{cardholders.length}</p>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
        <p className="text-xs font-semibold text-blue-900 mb-1.5 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> How balances update automatically
        </p>
        <div className="flex flex-col sm:flex-row gap-4 text-xs text-blue-800">
          <div className="flex items-start gap-2">
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Customer sends</strong> (e.g. RUB) → RUB balance <strong className="text-emerald-700">increases</strong> (we received)</span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowUpRight className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span><strong>Recipient receives</strong> (e.g. XOF) → XOF balance <strong className="text-red-600">decreases</strong> (we paid out)</span>
          </div>
        </div>
      </div>

      {/* ── Business Wallet Balances ── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-500" />
          Treasury Balances
        </h2>

        {sortedBalances.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
            <Wallet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No wallet data yet</p>
            <p className="text-gray-400 text-sm mt-1">Balances appear automatically when transactions are processed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedBalances.map(bal => (
              <WalletCard
                key={bal.currency}
                balance={bal}
                history={walletHistory}
                isAdmin={isAdmin}
                onEdit={() => setEditingCurrency(bal.currency)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cardholder Breakdown ── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-slate-500" />
          Cardholder Breakdown
          <span className="text-sm font-normal text-gray-400">— balances per cardholder account</span>
        </h2>

        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-gray-50 rounded-xl border border-gray-200">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">No cardholders found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(g => {
              const m = meta(g.currency)
              const isNeg = g.total < 0
              const isOpen = expandedGroup === g.currency
              const activeCount = g.cardholders.filter(c => c.status === 'active').length

              return (
                <div key={g.currency} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedGroup(isOpen ? null : g.currency)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-2xl">{m.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{g.currency}</span>
                        <span className="text-xs text-slate-400">{m.label}</span>
                        {isNeg && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Negative
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-emerald-600">↑ {fmt(g.totalReceived, m.symbol)}</span>
                        <span className="text-xs text-red-500">↓ {fmt(g.totalWithdrawn, m.symbol)}</span>
                        <span className="text-xs text-slate-400">{g.cardholders.length} holders · {activeCount} active</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-lg ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmt(g.total, m.symbol)}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {g.cardholders.sort((a, b) => b.computedBalance - a.computedBalance).map(ch => {
                        const isChNeg = ch.computedBalance < 0
                        return (
                          <div key={ch.id} className="px-5 py-4 flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0 mt-0.5">
                              {(ch.displayName || ch.accountHolder || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-800 text-sm">{ch.displayName || ch.accountHolder}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  ch.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                }`}>{ch.status}</span>
                              </div>
                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                {ch.paymentMethodName}
                                {ch.accountNumber ? ` · ···${ch.accountNumber.slice(-4)}` : ''}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-xs text-emerald-600">↑ {fmt(ch.pmTotalReceived, m.symbol)}</span>
                                <span className="text-xs text-slate-300">−</span>
                                <span className="text-xs text-red-500">↓ {fmt(ch.totalWithdrawn ?? 0, m.symbol)}</span>
                                <span className="text-xs text-slate-300">=</span>
                                <span className={`text-xs font-bold ${isChNeg ? 'text-red-600' : 'text-slate-700'}`}>
                                  {fmt(ch.computedBalance, m.symbol)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <div className="px-5 py-3 bg-slate-50 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total {g.currency}</span>
                        <span className={`font-bold ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(g.total, m.symbol)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editingCurrency && editingBalance && (
        <EditBalanceModal
          currency={editingCurrency}
          current={editingBalance.balance ?? 0}
          onClose={() => setEditingCurrency(null)}
        />
      )}
    </div>
  )
}

export default AuraWallet
