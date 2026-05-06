import React, { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, onSnapshot, query,
  updateDoc, where, orderBy,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { setActiveCardholder } from '../../services/cardholderService'
import { listenToPaymentMethodTotal } from '../../services/paymentMethodService'
import {
  ArrowDownCircle, ArrowUpCircle, Users,
  Activity, Calendar, ChevronDown, ChevronUp, CreditCard,
  Clock, Search,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Withdrawal {
  id: string
  cardholderId: string
  amount: number
  note: string
  createdAt: any
}

interface Order {
  id: string
  paymentMethod: string
  sendAmount: number
  receiveAmount?: number
  sendCurrency: string
  receiveCurrency?: string
  recipientName?: string
  providerName?: string
  provider?: string
  country?: string
  flag?: string
  status: string
  completedAt?: any
  createdAt?: any
}

type ActivityEntry =
  | { kind: 'received';   id: string; order: Order;      ts: Date }
  | { kind: 'withdrawn';  id: string; w: Withdrawal;     ts: Date }
  | { kind: 'activated';  id: string; ts: Date }
  | { kind: 'deactivated'; id: string; ts: Date }

type FilterType = 'all' | 'received' | 'withdrawn'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(ts: any): Date | null {
  if (!ts) return null
  try {
    return ts.toDate ? ts.toDate() : new Date(ts)
  } catch { return null }
}

function fmtDate(ts: any) {
  const d = toDate(ts)
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// ─── Live PM total ────────────────────────────────────────────────────────────

function useLivePmTotal(paymentMethodId: string) {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    if (!paymentMethodId) return
    return listenToPaymentMethodTotal(paymentMethodId, setTotal)
  }, [paymentMethodId])
  return total
}

// ─── Activity Timeline ────────────────────────────────────────────────────────

function ActivityTimeline({
  entries,
  currency,
}: {
  entries: ActivityEntry[]
  currency: string
}) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No activity yet</p>
      </div>
    )
  }

  // Group by day
  const groups: { date: Date; items: ActivityEntry[] }[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && isSameDay(last.date, entry.ts)) {
      last.items.push(entry)
    } else {
      groups.push({ date: entry.ts, items: [entry] })
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi}>
          {/* Day separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5 bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
              <Calendar className="w-3 h-3" />
              {fmtDay(g.date)}
            </div>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400">{g.items.length} event{g.items.length > 1 ? 's' : ''}</span>
          </div>

          {/* Events */}
          <div className="relative ml-4">
            {/* Vertical line */}
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200" />

            <div className="space-y-3">
              {g.items.map((entry, ei) => (
                <div key={ei} className="relative flex gap-4 items-start">
                  {/* Dot */}
                  <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm border-2 border-white ${
                    entry.kind === 'received'   ? 'bg-emerald-100 text-emerald-600' :
                    entry.kind === 'withdrawn'  ? 'bg-orange-100 text-orange-600'  :
                    entry.kind === 'activated'  ? 'bg-green-100 text-green-600'    :
                                                  'bg-gray-100 text-gray-500'
                  }`}>
                    {entry.kind === 'received'   && <ArrowDownCircle className="w-3.5 h-3.5" />}
                    {entry.kind === 'withdrawn'  && <ArrowUpCircle   className="w-3.5 h-3.5" />}
                    {entry.kind === 'activated'  && <span className="text-[10px] font-bold">✓</span>}
                    {entry.kind === 'deactivated' && <span className="text-[10px] font-bold">○</span>}
                  </div>

                  {/* Card */}
                  <div className={`flex-1 rounded-xl px-4 py-3 border text-sm ${
                    entry.kind === 'received'   ? 'bg-emerald-50 border-emerald-100'  :
                    entry.kind === 'withdrawn'  ? 'bg-orange-50  border-orange-100'   :
                    entry.kind === 'activated'  ? 'bg-green-50   border-green-100'    :
                                                  'bg-gray-50    border-gray-200'
                  }`}>
                    {entry.kind === 'received' && (
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-semibold text-emerald-800">
                            + {currency} {entry.order.sendAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {entry.order.recipientName && (
                            <span className="text-xs text-gray-500 ml-2">from {entry.order.recipientName}</span>
                          )}
                          {(entry.order.flag || entry.order.country) && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {entry.order.flag} {entry.order.country}
                            </div>
                          )}
                          {(entry.order.providerName || entry.order.provider) && (
                            <div className="text-xs text-gray-400">
                              via {entry.order.providerName || entry.order.provider}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <span className="inline-block text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                            Received
                          </span>
                          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{fmtDate(entry.order.completedAt ?? entry.order.createdAt)}
                          </p>
                        </div>
                      </div>
                    )}

                    {entry.kind === 'withdrawn' && (
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-semibold text-orange-800">
                            − {currency} {entry.w.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {entry.w.note && (
                            <p className="text-xs text-gray-500 mt-0.5">{entry.w.note}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <span className="inline-block text-[10px] bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-bold">
                            Withdrawn
                          </span>
                          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{fmtDate(entry.w.createdAt)}
                          </p>
                        </div>
                      </div>
                    )}

                    {(entry.kind === 'activated' || entry.kind === 'deactivated') && (
                      <div className="flex justify-between items-center">
                        <span className={`font-semibold text-sm ${entry.kind === 'activated' ? 'text-green-800' : 'text-gray-600'}`}>
                          Card {entry.kind === 'activated' ? 'activated' : 'deactivated'}
                        </span>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{fmtDate(entry.ts)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Single Cardholder Panel ──────────────────────────────────────────────────

function CardholderPanel({
  ch,
  method,
  allWithdrawals,
  allOrders,
  onStatusChange,
  defaultOpen,
}: {
  ch: Cardholder
  method: PaymentMethod | undefined
  allWithdrawals: Withdrawal[]
  allOrders: Order[]
  onStatusChange: () => void
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen ?? false)
  const [toggling, setToggling] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')

  const pmTotal = useLivePmTotal(ch.paymentMethodId)
  const currency = method?.currency ?? ''

  const myWithdrawals = allWithdrawals.filter(w => w.cardholderId === ch.id)
  const myOrders = allOrders.filter(
    o => o.paymentMethod === ch.paymentMethodId && o.status === 'completed'
  )

  const totalWithdrawn = myWithdrawals.reduce((s, w) => s + w.amount, 0)
  const balance = Math.max(0, pmTotal - totalWithdrawn)

  const fmt = (n: number) =>
    currency + ' ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Build unified activity entries sorted newest-first
  const allEntries = useMemo<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = []

    for (const o of myOrders) {
      const ts = toDate(o.completedAt ?? o.createdAt)
      if (ts) entries.push({ kind: 'received', id: o.id, order: o, ts })
    }
    for (const w of myWithdrawals) {
      const ts = toDate(w.createdAt)
      if (ts) entries.push({ kind: 'withdrawn', id: w.id, w, ts })
    }
    // Card start event
    const startTs = toDate(ch.createdAt)
    if (startTs) entries.push({ kind: 'activated', id: ch.id + '_start', ts: startTs })

    return entries.sort((a, b) => b.ts.getTime() - a.ts.getTime())
  }, [myOrders, myWithdrawals, ch.createdAt])

  const filtered = useMemo(() => {
    let list = allEntries
    if (filter !== 'all') list = list.filter(e => e.kind === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => {
        if (e.kind === 'received') return (
          String(e.order.sendAmount).includes(q) ||
          (e.order.recipientName ?? '').toLowerCase().includes(q) ||
          (e.order.country ?? '').toLowerCase().includes(q)
        )
        if (e.kind === 'withdrawn') return (
          String(e.w.amount).includes(q) ||
          (e.w.note ?? '').toLowerCase().includes(q)
        )
        return false
      })
    }
    return list
  }, [allEntries, filter, search])

  const handleToggle = async () => {
    setToggling(true)
    try {
      if (ch.status === 'active') {
        await updateDoc(doc(db, 'cardholders', ch.id), { status: 'inactive' })
      } else {
        await setActiveCardholder(ch.paymentMethodId, ch.id)
      }
      onStatusChange()
    } catch (err: any) {
      alert('Error: ' + err?.message)
    } finally {
      setToggling(false)
    }
  }

  const startDate = toDate(ch.createdAt)

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
      ch.status === 'active'
        ? 'border-emerald-200 bg-white'
        : 'border-gray-200 bg-gray-50/60'
    }`}>
      {/* ── Card Header ── */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: identity */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${
              ch.status === 'active'
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {(ch.accountHolder || ch.displayName || '?').substring(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-900 text-base leading-tight truncate">
                  {ch.accountHolder || ch.displayName || '—'}
                </p>
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all disabled:opacity-50 flex-shrink-0 ${
                    ch.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                      : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                  }`}
                  title={ch.status === 'active' ? 'Click to deactivate' : 'Click to activate'}
                >
                  {toggling
                    ? <span className="animate-spin w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full" />
                    : <span>{ch.status === 'active' ? '●' : '○'}</span>
                  }
                  {ch.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {method?.name ?? <span className="text-red-400">Unlinked</span>}
                {(ch.accountNumber || ch.phoneNumber) && (
                  <> · {ch.accountNumber || ch.phoneNumber}</>
                )}
              </p>
              {startDate && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  Card since {startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}
                  {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>

          {/* Right: stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="hidden sm:grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Received</p>
                <p className="text-sm font-bold text-emerald-600">{fmt(pmTotal)}</p>
                <p className="text-[10px] text-gray-400">{myOrders.length} orders</p>
              </div>
              <div className="text-center border-x border-gray-100 px-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Withdrawn</p>
                <p className="text-sm font-bold text-orange-600">{fmt(totalWithdrawn)}</p>
                <p className="text-[10px] text-gray-400">{myWithdrawals.length} times</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Balance</p>
                <p className={`text-sm font-bold ${balance > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>{fmt(balance)}</p>
                <p className="text-[10px] text-gray-400">{allEntries.length} events</p>
              </div>
            </div>

            {/* Expand toggle */}
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Hide' : 'Activity'}
            </button>
          </div>
        </div>

        {/* Mobile stats row */}
        <div className="sm:hidden grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
          <div className="text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Received</p>
            <p className="text-xs font-bold text-emerald-600">{fmt(pmTotal)}</p>
          </div>
          <div className="text-center border-x border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Withdrawn</p>
            <p className="text-xs font-bold text-orange-600">{fmt(totalWithdrawn)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Balance</p>
            <p className={`text-xs font-bold ${balance > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>{fmt(balance)}</p>
          </div>
        </div>
      </div>

      {/* ── Activity Panel ── */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Filter / Search bar */}
          <div className="px-5 py-3 bg-gray-50 flex flex-wrap items-center gap-2">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
              {(['all', 'received', 'withdrawn'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
                    filter === f
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f === 'all' ? `All (${allEntries.length})` :
                   f === 'received' ? `Received (${myOrders.length})` :
                   `Withdrawn (${myWithdrawals.length})`}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search amount, name, country…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Timeline */}
          <div className="px-5 py-5 max-h-[520px] overflow-y-auto">
            <ActivityTimeline entries={filtered} currency={currency} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CardholderActivity: React.FC = () => {
  const { data: cardholders, loading: chLoading } = useFirestoreQuery<Cardholder>('cardholders', 'createdAt')
  const { data: paymentMethods, loading: pmLoading } = useFirestoreQuery<PaymentMethod>('paymentMethods')

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tick, setTick] = useState(0)
  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Load withdrawals (real-time)
  useEffect(() => {
    const q = query(collection(db, 'cardholderWithdrawals'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Withdrawal)))
    })
  }, [])

  // Load all completed orders (real-time)
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'completed'))
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)))
    })
  }, [])

  if (chLoading || pmLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Summary totals
  const activeCount = cardholders.filter(c => c.status === 'active').length
  const totalOrders = orders.length
  const totalWithdrawals = withdrawals.length

  // Filter cardholders
  const visibleCardholders = cardholders.filter(ch => {
    if (statusFilter !== 'all' && ch.status !== statusFilter) return false
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase()
      return (
        (ch.accountHolder ?? '').toLowerCase().includes(q) ||
        (ch.displayName ?? '').toLowerCase().includes(q) ||
        (ch.accountNumber ?? '').toLowerCase().includes(q) ||
        (ch.phoneNumber ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            Cardholder Activity
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Full timeline of received payments, withdrawals, and card status changes — per cardholder.
          </p>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Cardholders',
            value: cardholders.length,
            sub: `${activeCount} active`,
            icon: <Users className="w-5 h-5" />,
            color: 'bg-slate-50 border-slate-200',
            iconColor: 'bg-slate-200 text-slate-600',
            textColor: 'text-slate-900',
          },
          {
            label: 'Active Cards',
            value: activeCount,
            sub: `${cardholders.length - activeCount} inactive`,
            icon: <CreditCard className="w-5 h-5" />,
            color: 'bg-emerald-50 border-emerald-200',
            iconColor: 'bg-emerald-200 text-emerald-700',
            textColor: 'text-emerald-900',
          },
          {
            label: 'Completed Orders',
            value: totalOrders,
            sub: 'total received',
            icon: <ArrowDownCircle className="w-5 h-5" />,
            color: 'bg-blue-50 border-blue-200',
            iconColor: 'bg-blue-200 text-blue-700',
            textColor: 'text-blue-900',
          },
          {
            label: 'Withdrawals Made',
            value: totalWithdrawals,
            sub: 'total withdrawals',
            icon: <ArrowUpCircle className="w-5 h-5" />,
            color: 'bg-orange-50 border-orange-200',
            iconColor: 'bg-orange-200 text-orange-700',
            textColor: 'text-orange-900',
          },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 flex items-center gap-3 ${s.color}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.iconColor}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.textColor}`}>{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Global Search & Filter ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, account or phone…"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'all' ? `All (${cardholders.length})` :
               s === 'active' ? `Active (${activeCount})` :
               `Inactive (${cardholders.length - activeCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cardholder Panels ── */}
      {visibleCardholders.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
          <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No cardholders found</p>
          {globalSearch && <p className="text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleCardholders.map(ch => (
            <CardholderPanel
              key={ch.id + tick}
              ch={ch}
              method={paymentMethods.find(m => m.id === ch.paymentMethodId)}
              allWithdrawals={withdrawals}
              allOrders={orders}
              onStatusChange={() => setTick(t => t + 1)}
              defaultOpen={visibleCardholders.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default CardholderActivity
