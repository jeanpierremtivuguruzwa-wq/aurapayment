import React, { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import { Wallet, CreditCard, AlertTriangle } from 'lucide-react'

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
function meta(code: string) {
  return CURRENCY_META[code] ?? { flag: '~', label: code, symbol: code }
}
function fmt(n: number, symbol: string) {
  return `${symbol} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface CardholderRow extends Cardholder {
  paymentMethodName: string
  pmTotalReceived: number   // from paymentMethod.totalReceived (authoritative)
  computedBalance: number   // pm.totalReceived - ch.totalWithdrawn
}
interface CurrencyGroup {
  currency: string
  total: number          // balance = received − withdrawn
  totalReceived: number
  totalWithdrawn: number
  cardholders: CardholderRow[]
  hasActiveMethod: boolean
}

// ── Main Component ─────────────────────────────────────────────────────────────
const AuraWallet: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [cardholders, setCardholders] = useState<Cardholder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

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

  // Build currency groups: seed from ALL active payment methods, then fill cardholder data
  const groups: CurrencyGroup[] = React.useMemo(() => {
    const methodMap: Record<string, PaymentMethod> = {}
    for (const m of methods) methodMap[m.id] = m

    const currencyMap: Record<string, CurrencyGroup> = {}

    // Seed every distinct currency from active payment methods
    for (const pm of methods) {
      if (!pm.active) continue
      const currency = pm.currency
      if (!currencyMap[currency]) {
        currencyMap[currency] = { currency, total: 0, totalReceived: 0, totalWithdrawn: 0, cardholders: [], hasActiveMethod: true }
      }
    }

    // Fill with cardholder balances
    for (const ch of cardholders) {
      const pm = methodMap[ch.paymentMethodId]
      if (!pm) continue
      const currency = pm.currency
      // Also add inactive-method currencies if they have cardholders
      if (!currencyMap[currency]) {
        currencyMap[currency] = { currency, total: 0, totalReceived: 0, totalWithdrawn: 0, cardholders: [], hasActiveMethod: false }
      }
      // Use pm.totalReceived as the authoritative received figure
      // (same logic as Cardholders panel: balance = pm.totalReceived - ch.totalWithdrawn)
      const received  = pm.totalReceived  ?? 0
      const withdrawn = ch.totalWithdrawn ?? 0
      const balance   = received - withdrawn
      currencyMap[currency].totalReceived  += received
      currencyMap[currency].totalWithdrawn += withdrawn
      currencyMap[currency].total          += balance
      currencyMap[currency].cardholders.push({
        ...ch,
        paymentMethodName: pm.name,
        pmTotalReceived: received,
        computedBalance: balance,
      })
    }

    // Sort: active-method currencies first, then by balance descending
    return Object.values(currencyMap).sort((a, b) => {
      if (a.hasActiveMethod !== b.hasActiveMethod) return a.hasActiveMethod ? -1 : 1
      return b.total - a.total
    })
  }, [methods, cardholders])

  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Wallet className="w-6 h-6 text-slate-600" /> AuraWallet</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live cardholder balances grouped by currency — updates automatically
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Cardholders</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{cardholders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Currencies Active</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{groups.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 col-span-2 sm:col-span-1">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Combined Holdings</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {groups.length > 0 ? grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
          </p>
        </div>
      </div>

      {/* Currency balance cards */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading wallet…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CreditCard className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No cardholder balances found.</p>
          <p className="text-sm mt-1">Add cardholders with assigned payment methods to see balances here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const m = meta(g.currency)
            const isNeg = g.total < 0
            const isLow = !isNeg && g.total < 1000
            const isEmpty = g.cardholders.length === 0
            const isOpen = expanded === g.currency
            const activeCount = g.cardholders.filter(c => c.status === 'active').length

            return (
              <div
                key={g.currency}
                className={`bg-white rounded-2xl border overflow-hidden ${
                  isEmpty ? 'border-slate-100 opacity-70' : 'border-slate-200'
                }`}
              >
                {/* Currency row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : g.currency)}
                  className="w-full text-left px-6 py-5 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-3xl">{m.flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-lg">{g.currency}</span>
                      <span className="text-sm text-slate-400">{m.label}</span>
                    {isNeg && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Negative</span>}
                      {isLow && !isNeg && !isEmpty && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">Low</span>}
                      {isEmpty && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">No cardholders</span>}
                    </div>
                    {!isEmpty && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-emerald-600">↑ Received: {fmt(g.totalReceived, m.symbol)}</span>
                        <span className="text-xs text-red-500">↓ Withdrawn: {fmt(g.totalWithdrawn, m.symbol)}</span>
                        <span className="text-xs text-slate-400">{g.cardholders.length} cardholder{g.cardholders.length !== 1 ? 's' : ''} · {activeCount} active</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right mr-2">
                    <div className={`text-2xl font-bold ${isEmpty ? 'text-slate-300' : isNeg ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {isEmpty ? fmt(0, m.symbol) : fmt(g.total, m.symbol)}
                    </div>
                    {!isEmpty && (
                      <p className="text-xs text-slate-400 mt-0.5">received − withdrawn</p>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Expanded: per-cardholder breakdown */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    <div className="px-6 py-2.5 bg-slate-50">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Cardholder Breakdown
                      </span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {g.cardholders.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">No cardholders assigned yet.</p>
                      )}
                      {g.cardholders
                        .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
                        .map(ch => {
                          const received  = ch.pmTotalReceived  // pm.totalReceived
                          const withdrawn = ch.totalWithdrawn ?? 0
                          const bal       = ch.computedBalance  // pm.totalReceived - withdrawn
                          const isChNeg   = bal < 0
                          return (
                            <div key={ch.id} className="px-6 py-4 flex items-start gap-4">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0 mt-0.5">
                                {(ch.displayName || ch.accountHolder || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-800 text-sm">
                                    {ch.displayName || ch.accountHolder}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    ch.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-600'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}>{ch.status}</span>
                                </div>
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {ch.paymentMethodName}
                                  {ch.accountNumber ? ` · ···${ch.accountNumber.slice(-4)}` : ''}
                                  {ch.phoneNumber ? ` · ${ch.phoneNumber}` : ''}
                                </p>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="text-xs text-emerald-600 font-medium">↑ {fmt(received, m.symbol)}</span>
                                  <span className="text-xs text-slate-400">−</span>
                                  <span className="text-xs text-red-500 font-medium">↓ {fmt(withdrawn, m.symbol)}</span>
                                  <span className="text-xs text-slate-400">=</span>
                                  <span className={`text-xs font-bold ${isChNeg ? 'text-red-600' : 'text-slate-700'}`}>
                                    {fmt(bal, m.symbol)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                    {/* Footer total */}
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-6 flex-wrap">
                      <span className="text-xs text-slate-500 font-medium">Total ({g.currency})</span>
                      <span className="text-xs text-emerald-600 font-medium">↑ Received: {fmt(g.totalReceived, m.symbol)}</span>
                      <span className="text-xs text-red-500 font-medium">↓ Withdrawn: {fmt(g.totalWithdrawn, m.symbol)}</span>
                      <span className="ml-auto">
                        <span className={`font-bold text-sm ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
                          Balance: {fmt(g.total, m.symbol)}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AuraWallet
