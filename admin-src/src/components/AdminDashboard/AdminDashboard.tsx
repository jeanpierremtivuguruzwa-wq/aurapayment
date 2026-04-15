import React, { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, limit, updateDoc, doc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Order, OrderStatus } from '../../types/Order'
import { CurrencyPair } from '../../types/CurrencyPair'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ago(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function fmt(n: number, currency?: string): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + (currency ? ` ${currency}` : '')
}

const STATUS_META: Record<OrderStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  pending:   { label: 'Pending',   dot: '🟡', bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200' },
  uploaded:  { label: 'Uploaded',  dot: '🔵', bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200'  },
  completed: { label: 'Completed', dot: '🟢', bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200' },
  cancelled: { label: 'Cancelled', dot: '🔴', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'   },
}

// ── Order card ────────────────────────────────────────────────────────────────

const OrderCard: React.FC<{ order: Order; isNew: boolean }> = ({ order, isNew }) => {
  const s = STATUS_META[order.status] ?? STATUS_META.pending
  const [updating, setUpdating] = useState(false)

  const updateStatus = async (status: OrderStatus) => {
    setUpdating(true)
    try { await updateDoc(doc(db, 'orders', order.id), { status }) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setUpdating(false) }
  }

  return (
    <div className={`relative rounded-2xl border ${s.border} ${s.bg} p-4 transition-all ${isNew ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
      {isNew && (
        <span className="absolute -top-2 -right-2 bg-amber-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide animate-bounce">
          New
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-mono text-slate-500">#{order.orderId || order.id.slice(0, 8).toUpperCase()}</p>
          <p className="font-semibold text-slate-900 text-sm mt-0.5 leading-tight">{order.senderName || order.userEmail || '—'}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
          {s.dot} {s.label}
        </span>
      </div>

      {/* Amount row */}
      <div className="flex items-center gap-2 mb-3 bg-white/60 rounded-xl px-3 py-2">
        <div className="text-center flex-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Sends</p>
          <p className="font-bold text-slate-800">{fmt(order.sendAmount)} <span className="text-xs font-semibold text-slate-500">{order.sendCurrency}</span></p>
        </div>
        <div className="text-slate-400 text-lg">→</div>
        <div className="text-center flex-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Gets</p>
          <p className="font-bold text-slate-800">{fmt(order.receiveAmount)} <span className="text-xs font-semibold text-slate-500">{order.receiveCurrency}</span></p>
        </div>
        <div className="text-center flex-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Rate</p>
          <p className="font-semibold text-slate-700 text-sm">{order.rate}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{ago(order.createdAt)}</span>
        {order.status === 'pending' && (
          <div className="flex gap-1.5">
            <button
              disabled={updating}
              onClick={() => updateStatus('completed')}
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              ✓ Complete
            </button>
            <button
              disabled={updating}
              onClick={() => updateStatus('cancelled')}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              ✕ Cancel
            </button>
          </div>
        )}
        {order.status === 'uploaded' && (
          <button
            disabled={updating}
            onClick={() => updateStatus('completed')}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            ✓ Mark Complete
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [pairs, setPairs] = useState<CurrencyPair[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [pairsLoading, setPairsLoading] = useState(true)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all' | 'active'>('active')
  const [ticker, setTicker] = useState(0)

  // Tick every second for live timestamps
  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  // Live orders — newest 50
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]

      // Detect newly added orders
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const id = change.doc.id
          setNewOrderIds(prev => new Set([...prev, id]))
          setTimeout(() => setNewOrderIds(prev => {
            const next = new Set(prev); next.delete(id); return next
          }), 8000)
        }
      })

      setOrders(fresh)
      setOrdersLoading(false)
    }, () => setOrdersLoading(false))
    return () => unsub()
  }, [])

  // Live currency pairs
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'currencyPairs')), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as CurrencyPair[]
      data.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to))
      setPairs(data)
      setPairsLoading(false)
    }, () => setPairsLoading(false))
    return () => unsub()
  }, [])

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders
    if (statusFilter === 'active') return orders.filter(o => o.status === 'pending' || o.status === 'uploaded')
    return orders.filter(o => o.status === statusFilter)
  }, [orders, statusFilter, ticker])

  const stats = useMemo(() => ({
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    uploaded:  orders.filter(o => o.status === 'uploaded').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    volume:    orders.filter(o => o.status === 'completed').reduce((s, o) => s + Number(o.sendAmount || 0), 0),
  }), [orders])

  const activePairs = pairs.filter(p => p.active !== false)

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live orders &amp; exchange rates</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
          Live
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Orders', value: stats.total,     color: 'text-slate-800',  bg: 'bg-white' },
          { label: 'Pending',      value: stats.pending,   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
          { label: 'Uploaded',     value: stats.uploaded,  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'   },
          { label: 'Completed',    value: stats.completed, color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
          { label: 'Cancelled',    value: stats.cancelled, color: 'text-red-700',    bg: 'bg-red-50 border-red-200'     },
          { label: 'Volume',       value: fmt(stats.volume), color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', small: true },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border px-4 py-3 ${s.bg}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`font-bold mt-0.5 ${s.color} ${s.small ? 'text-base' : 'text-2xl'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid: Orders + Rates ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Orders panel (takes 2/3 width on xl) ── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-lg">Incoming Orders</h2>
            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {(["active", "all", "pending", "uploaded", "completed", "cancelled"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors capitalize ${
                    statusFilter === f
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {f === 'active' ? `🟡 Active (${stats.pending + stats.uploaded})` : f === 'all' ? `All (${stats.total})` : f === 'pending' ? `Pending (${stats.pending})` : f === 'uploaded' ? `Uploaded (${stats.uploaded})` : f === 'completed' ? `Done (${stats.completed})` : `Cancelled (${stats.cancelled})`}
                </button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-slate-500">No orders {statusFilter === 'active' ? 'in progress — all done!' : statusFilter !== 'all' ? `with status "${statusFilter}"` : 'yet'}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[78vh] overflow-y-auto pr-1">
              {filteredOrders.map(order => (
                <OrderCard key={order.id} order={order} isNew={newOrderIds.has(order.id)} />
              ))}
            </div>
          )}
        </div>

        {/* ── Rates panel (1/3 width on xl) ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-lg">Exchange Rates</h2>
            <span className="text-xs text-slate-400">{activePairs.length} active</span>
          </div>

          {pairsLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/2 mb-2" />
                  <div className="h-6 bg-slate-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : pairs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center">
              <p className="text-slate-400 text-sm">No currency pairs configured</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[78vh] overflow-y-auto pr-1">
              {pairs.map(pair => {
                const active = pair.active !== false
                return (
                  <div
                    key={pair.id}
                    className={`rounded-2xl border px-4 py-3 transition-all ${
                      active
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50 border-slate-100 opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {pair.flag && <span className="text-xl">{pair.flag}</span>}
                        <div>
                          <p className="text-xs text-slate-500 leading-none">{pair.country || pair.to}</p>
                          <p className="font-semibold text-slate-900 text-sm">
                            {pair.from} → {pair.to}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800 text-lg leading-none">{pair.rate}</p>
                        {pair.urgent && (
                          <span className="text-[10px] text-orange-600 font-semibold">⚡ Urgent</span>
                        )}
                      </div>
                    </div>
                    {!active && (
                      <p className="text-[10px] text-slate-400 mt-1">Inactive</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default AdminDashboard
