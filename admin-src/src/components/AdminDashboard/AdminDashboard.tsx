import React, { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, limit, updateDoc, doc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Order, OrderStatus } from '../../types/Order'
import { CurrencyPair } from '../../types/CurrencyPair'
import { Inbox, RefreshCw, Zap, ArrowRightLeft, Users, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmt(n: number, currency?: string): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + (currency ? ` ${currency}` : '')
}

// ── Transaction card ──────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order & { [key: string]: any }
  isNew: boolean
}

const OrderCard: React.FC<OrderCardProps> = ({ order, isNew }) => {
  const [updating, setUpdating] = useState(false)

  const updateStatus = async (status: OrderStatus) => {
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status,
        updatedBy: 'Admin',
        [`${status}At`]: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      })
    } catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setUpdating(false) }
  }

  const method = order.providerName || order.provider || order.paymentMethod || '—'
  const phone  = order.phoneNumber || order.recipientPhone || '—'
  const bank   = order.accountNumber || order.bankName || '—'
  const sender = order.senderName || order.userEmail || '—'
  const email  = order.senderEmail || order.userEmail || '—'
  const tel    = order.senderPhone || order.senderTel || '—'
  const updBy  = order.updatedBy || order.claimedByName || order.claimedBy || '—'

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${
      isNew ? 'border-amber-400 ring-2 ring-amber-300 ring-offset-1' : 'border-gray-200'
    }`}>
      {isNew && (
        <div className="bg-amber-400 text-white text-[10px] font-bold text-center py-0.5 uppercase tracking-widest">
          New Order
        </div>
      )}

      <div className="p-4 space-y-0">

        {/* Recipient block */}
        <Row label="Recipient"       value={order.recipientName || '—'} bold />
        <Row label="Receiver Gets"   value={`${fmt(order.receiveAmount)} ${order.receiveCurrency}`} />
        <Row label="Method"          value={method} />
        <Row label="Phone"           value={phone} />
        <Row label="Bank"            value={bank} />
        <Row label="Date"            value={fmtDate(order.createdAt)} muted />

        {/* Divider */}
        <div className="border-t border-dashed border-gray-200 my-3" />

        {/* Sender block */}
        <Row label="Sender"          value={sender} bold />
        <Row label="Email"           value={email} />
        <Row label="Tel"             value={tel} />
        <Row label="Amount"          value={`${fmt(order.sendAmount)} ${order.sendCurrency}`} />
        <Row label="Mode"            value={order.deliveryMethod || method} />

        {/* Divider */}
        <div className="border-t border-gray-100 my-3" />

        <Row label="Updated By"      value={updBy} muted />

        {/* Order ref */}
        <div className="mt-1">
          <span className="text-[10px] text-gray-400 font-mono">
            #{order.orderId || order.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Status action buttons */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {(['pending', 'completed', 'cancelled'] as OrderStatus[]).map(s => {
            const isActive = order.status === s
            const styles: Record<string, string> = {
              pending:   isActive ? 'bg-amber-500  text-white border-amber-500'  : 'bg-white text-amber-600  border-amber-300  hover:bg-amber-50',
              completed: isActive ? 'bg-green-600  text-white border-green-600'  : 'bg-white text-green-600  border-green-300  hover:bg-green-50',
              cancelled: isActive ? 'bg-gray-800   text-white border-gray-800'   : 'bg-white text-gray-500   border-gray-300   hover:bg-gray-50',
            }
            return (
              <button
                key={s}
                disabled={updating || isActive}
                onClick={() => updateStatus(s)}
                className={`flex-1 min-w-[80px] text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:cursor-default capitalize ${styles[s]}`}
              >
                {updating && !isActive ? '…' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex gap-1 text-sm leading-6">
      <span className="text-gray-500 font-medium shrink-0 w-[110px]">{label}:</span>
      <span className={`truncate ${bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'orders' | 'rates' | 'cardholders' | 'wallet'

const AdminDashboard: React.FC = () => {
  const [orders, setOrders]           = useState<Order[]>([])
  const [pairs, setPairs]             = useState<CurrencyPair[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [pairsLoading, setPairsLoading]   = useState(true)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const [tab, setTab]                 = useState<Tab>('orders')

  // Live orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(80))
    const unsub = onSnapshot(q, snap => {
      const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]
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
      setPairs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as CurrencyPair[])
      setPairsLoading(false)
    }, () => setPairsLoading(false))
    return () => unsub()
  }, [])

  const pending = useMemo(() =>
    orders.filter(o => o.status === 'pending' || o.status === 'uploaded'),
  [orders])

  const others = useMemo(() =>
    orders.filter(o => o.status === 'completed' || o.status === 'cancelled'),
  [orders])

  const stats = useMemo(() => ({
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    uploaded:  orders.filter(o => o.status === 'uploaded').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders])

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'orders',      label: 'Dashboard',   Icon: ArrowRightLeft },
    { id: 'rates',       label: 'Rates',        Icon: Zap            },
    { id: 'cardholders', label: 'Cardholders',  Icon: Users          },
    { id: 'wallet',      label: 'Wallet',       Icon: ArrowDownCircle},
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 sticky top-0 z-10">
        <div className="flex items-center gap-0 overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-5 py-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">

        {/* ── Dashboard tab ── */}
        {tab === 'orders' && (
          <>
            {/* Header + action buttons */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-500">
                  {ordersLoading ? 'Loading…' : `${stats.total} total orders · ${stats.pending + stats.uploaded} active`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                </span>
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total',     value: stats.total,     cls: 'text-gray-800' },
                { label: 'Pending',   value: stats.pending,   cls: 'text-amber-600' },
                { label: 'Uploaded',  value: stats.uploaded,  cls: 'text-blue-600' },
                { label: 'Completed', value: stats.completed, cls: 'text-green-600' },
                { label: 'Cancelled', value: stats.cancelled, cls: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-2xl font-black mt-0.5 ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ── Left: Pending Transactions ── */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-800">
                    Pending Transactions
                    <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {pending.length}
                    </span>
                  </h2>
                  {ordersLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                </div>

                {ordersLoading ? (
                  <SkeletonCards />
                ) : pending.length === 0 ? (
                  <EmptyState label="No pending transactions" />
                ) : (
                  <div className="space-y-3 max-h-[78vh] overflow-y-auto pr-1">
                    {pending.map(o => (
                      <OrderCard key={o.id} order={o as any} isNew={newOrderIds.has(o.id)} />
                    ))}
                  </div>
                )}
              </section>

              {/* ── Right: Other Transactions ── */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-800">
                    Other Transactions
                    <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {others.length}
                    </span>
                  </h2>
                  {ordersLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                </div>

                {ordersLoading ? (
                  <SkeletonCards />
                ) : others.length === 0 ? (
                  <EmptyState label="No completed or cancelled transactions yet" />
                ) : (
                  <div className="space-y-3 max-h-[78vh] overflow-y-auto pr-1">
                    {others.map(o => (
                      <OrderCard key={o.id} order={o as any} isNew={newOrderIds.has(o.id)} />
                    ))}
                  </div>
                )}
              </section>

            </div>
          </>
        )}

        {/* ── Rates tab ── */}
        {tab === 'rates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">Exchange Rates</h1>
              <span className="text-sm text-gray-500">{pairs.filter(p => p.active !== false).length} active pairs</span>
            </div>

            {pairsLoading ? (
              <SkeletonCards count={6} />
            ) : pairs.length === 0 ? (
              <EmptyState label="No currency pairs configured" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pairs.map(pair => {
                  const active = pair.active !== false
                  return (
                    <div
                      key={pair.id}
                      className={`bg-white border rounded-2xl px-5 py-4 flex items-center justify-between transition-all ${
                        active ? 'border-gray-200 hover:shadow-md' : 'border-gray-100 opacity-40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {pair.flag && <span className="text-2xl">{pair.flag}</span>}
                        <div>
                          <p className="text-xs text-gray-400">{pair.country || pair.to}</p>
                          <p className="font-bold text-gray-900">{pair.from} → {pair.to}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-gray-900">{pair.rate}</p>
                        {pair.urgent && (
                          <span className="text-xs text-orange-500 flex items-center gap-0.5 justify-end">
                            <Zap size={11} /> Urgent
                          </span>
                        )}
                        {!active && <p className="text-xs text-gray-300">Inactive</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Cardholders / Wallet tabs (placeholders) ── */}
        {(tab === 'cardholders' || tab === 'wallet') && (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <div className="text-center">
              {tab === 'cardholders'
                ? <Users size={40} className="mx-auto mb-3 opacity-30" />
                : <ArrowUpCircle size={40} className="mx-auto mb-3 opacity-30" />}
              <p className="font-medium">
                {tab === 'cardholders' ? 'Use Cardholders in the sidebar' : 'Use Aura Wallet in the sidebar'}
              </p>
              <p className="text-sm mt-1">Navigate using the left sidebar for full functionality.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse space-y-2">
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-14 text-center">
      <Inbox size={32} className="mx-auto mb-2 text-gray-300" />
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

export default AdminDashboard
