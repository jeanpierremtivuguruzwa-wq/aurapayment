import React, { useEffect, useState, useMemo } from 'react'
import {
  collection, onSnapshot, query, orderBy, limit, updateDoc, doc,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Order, OrderStatus } from '../../types/Order'
import { CurrencyPair } from '../../types/CurrencyPair'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import {
  ArrowRightLeft, Inbox, RefreshCw, Zap, Users, Wallet,
  CreditCard, Landmark, Smartphone, TrendingUp, Activity,
  CheckCircle2, Clock, XCircle, UploadCloud, LayoutDashboard,
} from 'lucide-react'

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtDate(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmt(n: any, currency?: string): string {
  if (n == null || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n)) + (currency ? ` ${currency}` : '')
}

// ── Row display helper ─────────────────────────────────────────────────────────

function Row({
  label, value, bold, muted,
}: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex gap-1 text-sm leading-6">
      <span className="text-gray-500 font-medium shrink-0 w-[120px]">{label}:</span>
      <span className={`truncate ${bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Skeleton + Empty ───────────────────────────────────────────────────────────

function SkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse space-y-2">
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
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

// ── Transaction Card ───────────────────────────────────────────────────────────

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

  const statusColor: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    uploaded:  'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${
      isNew ? 'border-amber-400 ring-2 ring-amber-300 ring-offset-1' : 'border-gray-200'
    }`}>
      {isNew && (
        <div className="bg-amber-400 text-white text-[10px] font-bold text-center py-0.5 uppercase tracking-widest">
          New Order
        </div>
      )}

      {/* Status badge top-right */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <span className="text-[10px] font-mono text-gray-400">
          #{order.orderId || order.id.slice(0, 8).toUpperCase()}
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[order.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {order.status}
        </span>
      </div>

      <div className="px-4 pb-4 pt-2 space-y-0">
        {/* Recipient block */}
        <Row label="Recipient"     value={order.recipientName || '—'} bold />
        <Row label="Receiver Gets" value={`${fmt(order.receiveAmount)} ${order.receiveCurrency || ''}`} />
        <Row label="Method"        value={method} />
        <Row label="Phone"         value={phone} />
        <Row label="Bank"          value={bank} />
        <Row label="Date"          value={fmtDate(order.createdAt)} muted />

        <div className="border-t border-dashed border-gray-200 my-3" />

        {/* Sender block */}
        <Row label="Sender"   value={sender} bold />
        <Row label="Email"    value={email} />
        <Row label="Tel"      value={tel} />
        <Row label="Amount"   value={`${fmt(order.sendAmount)} ${order.sendCurrency || ''}`} />
        <Row label="Mode"     value={order.deliveryMethod || method} />

        <div className="border-t border-gray-100 my-3" />

        <Row label="Updated By" value={updBy} muted />

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

// ── Cardholder Card ────────────────────────────────────────────────────────────

const CardholderCard: React.FC<{ ch: Cardholder; pm?: PaymentMethod }> = ({ ch, pm }) => {
  const balance = ch.balance ?? Math.max(0, (ch.totalReceived ?? 0) - (ch.totalWithdrawn ?? 0))
  const typeIcon = pm?.type === 'bank'
    ? <Landmark size={14} className="text-blue-400" />
    : pm?.type === 'mobile'
    ? <Smartphone size={14} className="text-green-400" />
    : <CreditCard size={14} className="text-gray-400" />

  return (
    <div className={`bg-white border rounded-xl p-4 flex items-start gap-3 transition-shadow hover:shadow-sm ${
      ch.status === 'active' ? 'border-green-200' : 'border-gray-200 opacity-60'
    }`}>
      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-sm font-bold text-gray-500 uppercase">
        {ch.displayName?.[0] || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {typeIcon}
          <p className="font-semibold text-gray-900 text-sm truncate">{ch.displayName}</p>
          {ch.status === 'active' && (
            <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{ch.accountHolder}</p>
        <p className="text-xs text-gray-400 truncate">{pm?.name || '—'} · {pm?.currency || ''}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-gray-500">Balance</span>
          <span className="font-bold text-green-600 text-sm">
            {fmt(balance)} {pm?.currency || ''}
          </span>
        </div>
        {ch.transactionsCount != null && (
          <p className="text-[11px] text-gray-400 mt-0.5">{ch.transactionsCount} transactions</p>
        )}
      </div>
    </div>
  )
}

// ── Currency Pair Card ─────────────────────────────────────────────────────────

const PairCard: React.FC<{ pair: CurrencyPair & { [k: string]: any } }> = ({ pair }) => {
  const active = pair.active !== false
  return (
    <div className={`bg-white border rounded-xl px-4 py-3 flex items-center justify-between transition-all hover:shadow-sm ${
      active ? 'border-gray-200' : 'border-gray-100 opacity-40'
    }`}>
      <div className="flex items-center gap-3">
        {pair.flag && <span className="text-xl">{pair.flag}</span>}
        <div>
          <p className="text-[11px] text-gray-400">{pair.country || pair.to}</p>
          <p className="font-bold text-gray-900 text-sm">{pair.from} → {pair.to}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-black text-gray-900">{pair.rate}</p>
        {pair.urgent && (
          <span className="text-[10px] text-orange-500 flex items-center gap-0.5 justify-end">
            <Zap size={10} /> Urgent
          </span>
        )}
      </div>
    </div>
  )
}

// ── Wallet Balance Card ────────────────────────────────────────────────────────

const WalletCard: React.FC<{ currency: string; balance: number; symbol: string; flag: string }> = ({
  currency, balance, symbol, flag,
}) => (
  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
    <span className="text-2xl">{flag}</span>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{currency}</p>
      <p className="font-black text-lg text-gray-900 truncate">{symbol} {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    </div>
    <Wallet size={16} className="text-gray-300 shrink-0" />
  </div>
)

// ── Currency metadata ──────────────────────────────────────────────────────────

const CURR_META: Record<string, { flag: string; symbol: string }> = {
  RUB: { flag: '🇷🇺', symbol: '₽'   },
  XOF: { flag: '🌍', symbol: 'CFA' },
  XAF: { flag: '🌍', symbol: 'FCFA'},
  USD: { flag: '🇺🇸', symbol: '$'   },
  EUR: { flag: '🇪🇺', symbol: '€'   },
  GBP: { flag: '🇬🇧', symbol: '£'   },
  AED: { flag: '🇦🇪', symbol: 'د.إ' },
  CNY: { flag: '🇨🇳', symbol: '¥'   },
  TRY: { flag: '🇹🇷', symbol: '₺'   },
  INR: { flag: '🇮🇳', symbol: '₹'   },
  UGX: { flag: '🇺🇬', symbol: 'UGX' },
  RWF: { flag: '🇷🇼', symbol: 'RWF' },
  KES: { flag: '🇰🇪', symbol: 'KSh' },
  TZS: { flag: '🇹🇿', symbol: 'TSh' },
}
const currMeta = (c: string) => CURR_META[c] ?? { flag: '💱', symbol: c }

// ── Tab type ───────────────────────────────────────────────────────────────────

type Tab = 'orders' | 'cardholders' | 'rates' | 'wallet'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AuraDashboard: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tab, setTab]                         = useState<Tab>('orders')
  const [orders, setOrders]                   = useState<Order[]>([])
  const [pairs, setPairs]                     = useState<CurrencyPair[]>([])
  const [cardholders, setCardholders]         = useState<Cardholder[]>([])
  const [paymentMethods, setPaymentMethods]   = useState<PaymentMethod[]>([])
  const [walletBalances, setWalletBalances]   = useState<{ currency: string; balance: number }[]>([])
  const [newOrderIds, setNewOrderIds]         = useState<Set<string>>(new Set())

  const [ordersLoading, setOrdersLoading]             = useState(true)
  const [pairsLoading, setPairsLoading]               = useState(true)
  const [cardholdersLoading, setCardholdersLoading]   = useState(true)
  const [walletLoading, setWalletLoading]             = useState(true)

  // ── Live orders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100))
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

  // ── Live currency pairs ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'currencyPairs')), snap => {
      setPairs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as CurrencyPair[])
      setPairsLoading(false)
    }, () => setPairsLoading(false))
    return () => unsub()
  }, [])

  // ── Live cardholders ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'cardholders')), snap => {
      setCardholders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Cardholder[])
      setCardholdersLoading(false)
    }, () => setCardholdersLoading(false))
    return () => unsub()
  }, [])

  // ── Live payment methods ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'paymentMethods')), snap => {
      setPaymentMethods(snap.docs.map(d => ({ id: d.id, ...d.data() })) as PaymentMethod[])
    })
    return () => unsub()
  }, [])

  // ── Live wallet balances ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'walletBalances')), snap => {
      setWalletBalances(snap.docs.map(d => ({ currency: d.id, balance: d.data().balance ?? 0 })))
      setWalletLoading(false)
    }, () => setWalletLoading(false))
    return () => unsub()
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────────
  const pending = useMemo(() => orders.filter(o => o.status === 'pending' || o.status === 'uploaded'), [orders])
  const others  = useMemo(() => orders.filter(o => o.status === 'completed' || o.status === 'cancelled'), [orders])

  const stats = useMemo(() => ({
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    uploaded:  orders.filter(o => o.status === 'uploaded').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders])

  const pmMap = useMemo(() => {
    const m: Record<string, PaymentMethod> = {}
    paymentMethods.forEach(pm => { m[pm.id] = pm })
    return m
  }, [paymentMethods])

  const activePairs      = useMemo(() => pairs.filter(p => p.active !== false), [pairs])
  const activeCardholders = useMemo(() => cardholders.filter(c => c.status === 'active'), [cardholders])

  // ── Tab config ──────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; Icon: React.ElementType; badge?: number }[] = [
    { id: 'orders',      label: 'Dashboard',   Icon: LayoutDashboard, badge: pending.length || undefined },
    { id: 'cardholders', label: 'Cardholders',  Icon: Users,           badge: activeCardholders.length || undefined },
    { id: 'rates',       label: 'Rates',        Icon: Zap,             badge: activePairs.length || undefined },
    { id: 'wallet',      label: 'Wallet',       Icon: Wallet },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 sticky top-0 z-10">
        <div className="flex items-center gap-0 overflow-x-auto">
          {TABS.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-1.5 px-5 py-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
              {badge != null && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">

        {/* ═══════════════════════════════════════════════════════════════════
            DASHBOARD TAB — two-column pending + other transactions
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === 'orders' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Aura Dashboard</h1>
                <p className="text-sm text-gray-500">
                  {ordersLoading ? 'Loading…' : `${stats.total} orders · ${stats.pending + stats.uploaded} active`}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Live
              </span>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total',     value: stats.total,     Icon: ArrowRightLeft, cls: 'text-gray-800' },
                { label: 'Pending',   value: stats.pending,   Icon: Clock,          cls: 'text-amber-600' },
                { label: 'Uploaded',  value: stats.uploaded,  Icon: UploadCloud,    cls: 'text-blue-600' },
                { label: 'Completed', value: stats.completed, Icon: CheckCircle2,   cls: 'text-green-600' },
                { label: 'Cancelled', value: stats.cancelled, Icon: XCircle,        cls: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <s.Icon size={18} className={`shrink-0 ${s.cls}`} strokeWidth={1.5} />
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide leading-tight">{s.label}</p>
                    <p className={`text-2xl font-black leading-tight ${s.cls}`}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Two-column transaction layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ── Left: Pending ── */}
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

              {/* ── Right: Other ── */}
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

        {/* ═══════════════════════════════════════════════════════════════════
            CARDHOLDERS TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === 'cardholders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Cardholders</h1>
                <p className="text-sm text-gray-500">
                  {cardholdersLoading ? 'Loading…' : `${cardholders.length} total · ${activeCardholders.length} active`}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <Activity size={12} /> {activeCardholders.length} Active
                </span>
                <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 font-medium px-3 py-1.5 rounded-full">
                  {cardholders.filter(c => c.status !== 'active').length} Inactive
                </span>
              </div>
            </div>

            {/* Summary strip */}
            {!cardholdersLoading && cardholders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total',       value: cardholders.length,                                      cls: 'text-gray-800' },
                  { label: 'Active',      value: activeCardholders.length,                                 cls: 'text-green-600' },
                  { label: 'Total Rcvd',  value: `${cardholders.reduce((s,c) => s + (c.totalReceived ?? 0), 0).toLocaleString(undefined,{maximumFractionDigits:0})}`,  cls: 'text-blue-600' },
                  { label: 'Total W/D',   value: `${cardholders.reduce((s,c) => s + (c.totalWithdrawn ?? 0), 0).toLocaleString(undefined,{maximumFractionDigits:0})}`, cls: 'text-amber-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
                    <p className={`text-xl font-black mt-0.5 ${s.cls}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {cardholdersLoading ? (
              <SkeletonCards count={4} />
            ) : cardholders.length === 0 ? (
              <EmptyState label="No cardholders found" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cardholders
                  .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1))
                  .map(ch => (
                    <CardholderCard key={ch.id} ch={ch} pm={pmMap[ch.paymentMethodId]} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            RATES TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === 'rates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h1 className="text-xl font-bold text-gray-900">Exchange Rates</h1>
              <span className="text-sm text-gray-500">{activePairs.length} active pairs</span>
            </div>
            {pairsLoading ? (
              <SkeletonCards count={6} />
            ) : pairs.length === 0 ? (
              <EmptyState label="No currency pairs configured" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pairs.map(pair => <PairCard key={pair.id} pair={pair as any} />)}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            WALLET TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {tab === 'wallet' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Aura Wallet</h1>
                <p className="text-sm text-gray-500">{walletBalances.length} currency balances</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-full">
                <TrendingUp size={12} /> Live balances
              </span>
            </div>

            {/* Payment method summary */}
            {paymentMethods.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <CreditCard size={15} className="text-gray-400" />
                  Payment Methods
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {paymentMethods.map(pm => {
                    const m = currMeta(pm.currency)
                    return (
                      <div key={pm.id} className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm ${pm.active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                        <span className="text-lg">{m.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate text-xs">{pm.name}</p>
                          <p className="text-[11px] text-gray-400">{pm.currency} · {pm.type}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-green-600">
                            {m.symbol} {(pm.totalReceived ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10px] text-gray-400">received</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Wallet balances */}
            {walletLoading ? (
              <SkeletonCards count={4} />
            ) : walletBalances.length === 0 ? (
              <EmptyState label="No wallet balances found" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {walletBalances.map(wb => {
                  const m = currMeta(wb.currency)
                  return (
                    <WalletCard
                      key={wb.currency}
                      currency={wb.currency}
                      balance={wb.balance}
                      symbol={m.symbol}
                      flag={m.flag}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default AuraDashboard
