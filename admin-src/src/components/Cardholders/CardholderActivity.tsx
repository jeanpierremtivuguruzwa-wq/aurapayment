import React, { useEffect, useState } from 'react'
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
  sendCurrency: string
  status: string
  completedAt?: any
  createdAt?: any
}

// ─── Live Balance for one payment method ─────────────────────────────────────

function useLivePmTotal(paymentMethodId: string) {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    if (!paymentMethodId) return
    return listenToPaymentMethodTotal(paymentMethodId, setTotal)
  }, [paymentMethodId])
  return total
}

// ─── Row component ────────────────────────────────────────────────────────────

function CardholderRow({
  ch,
  method,
  allWithdrawals,
  allOrders,
  onStatusChange,
}: {
  ch: Cardholder
  method: PaymentMethod | undefined
  allWithdrawals: Withdrawal[]
  allOrders: Order[]
  onStatusChange: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const pmTotal = useLivePmTotal(ch.paymentMethodId)

  const myWithdrawals = allWithdrawals.filter(w => w.cardholderId === ch.id)
  const myOrders = allOrders.filter(o => o.paymentMethod === ch.paymentMethodId && o.status === 'completed')

  const totalReceived = pmTotal
  const totalWithdrawn = myWithdrawals.reduce((s, w) => s + w.amount, 0)
  const balance = Math.max(0, totalReceived - totalWithdrawn)

  const fmt = (n: number) =>
    (method?.currency ?? '₽') + ' ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmtDate = (ts: any) => {
    if (!ts) return '—'
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  }

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

  return (
    <>
      {/* ── Main Row ── */}
      <tr
        className={`border-b border-gray-100 transition-colors ${
          ch.status === 'active' ? 'bg-white hover:bg-green-50/30' : 'bg-gray-50/60 hover:bg-gray-100/60'
        }`}
      >
        {/* Status toggle */}
        <td className="py-3 px-4 whitespace-nowrap">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all disabled:opacity-50 ${
              ch.status === 'active'
                ? 'bg-green-100 text-green-700 border-green-300 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300'
                : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700 hover:border-green-300'
            }`}
            title={ch.status === 'active' ? 'Click to deactivate' : 'Click to activate'}
          >
            {toggling ? (
              <span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <span>{ch.status === 'active' ? '✓' : '○'}</span>
            )}
            {ch.status === 'active' ? 'Active' : 'Inactive'}
          </button>
        </td>

        {/* Name */}
        <td className="py-3 px-4">
          <p className="font-semibold text-gray-900 text-sm">{ch.accountHolder || '—'}</p>
          <p className="text-xs text-gray-400">{ch.displayName || ''}</p>
        </td>

        {/* Payment Method */}
        <td className="py-3 px-4 whitespace-nowrap">
          {method ? (
            <div>
              <p className="text-sm font-medium text-gray-700">{method.name}</p>
              <p className="text-xs text-gray-400">
                {ch.accountNumber || ch.phoneNumber || method.accountNumber || method.phoneNumber || '—'}
              </p>
            </div>
          ) : (
            <span className="text-xs text-red-400">⚠️ Unlinked</span>
          )}
        </td>

        {/* Total Received */}
        <td className="py-3 px-4 whitespace-nowrap text-right">
          <span className="font-semibold text-green-600">{fmt(totalReceived)}</span>
          <p className="text-xs text-gray-400">{myOrders.length} orders</p>
        </td>

        {/* Total Withdrawn */}
        <td className="py-3 px-4 whitespace-nowrap text-right">
          <span className="font-semibold text-orange-600">{fmt(totalWithdrawn)}</span>
          <p className="text-xs text-gray-400">{myWithdrawals.length} withdrawals</p>
        </td>

        {/* Balance */}
        <td className="py-3 px-4 whitespace-nowrap text-right">
          <span className={`font-bold text-base ${balance > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
            {fmt(balance)}
          </span>
        </td>

        {/* Expand */}
        <td className="py-3 px-4 whitespace-nowrap">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500 font-medium"
          >
            {expanded ? '▲ Hide' : '▼ History'}
          </button>
        </td>
      </tr>

      {/* ── Expanded History ── */}
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Orders / Received */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">
                  💰 Money Received ({myOrders.length})
                </h4>
                {myOrders.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No completed orders yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {myOrders.slice().reverse().map(o => (
                      <div key={o.id} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-green-100">
                        <div>
                          <span className="text-xs font-semibold text-gray-700">
                            {o.sendAmount?.toLocaleString()} {o.sendCurrency}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-2">{fmtDate(o.completedAt ?? o.createdAt)}</span>
                        </div>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">Completed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Withdrawals */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-orange-700 mb-2">
                  💸 Withdrawals ({myWithdrawals.length})
                </h4>
                {myWithdrawals.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No withdrawals yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {myWithdrawals.slice().reverse().map(w => (
                      <div key={w.id} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-orange-100">
                        <div>
                          <span className="text-xs font-semibold text-gray-700">
                            {w.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {w.note && <span className="text-[10px] text-gray-400 ml-2">{w.note}</span>}
                          <span className="text-[10px] text-gray-400 ml-2">{fmtDate(w.createdAt)}</span>
                        </div>
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">Withdrawn</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CardholderActivity: React.FC = () => {
  const { data: cardholders, loading: chLoading } = useFirestoreQuery<Cardholder>('cardholders', 'createdAt')
  const { data: paymentMethods, loading: pmLoading } = useFirestoreQuery<PaymentMethod>('paymentMethods')

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tick, setTick] = useState(0) // force re-render after status change

  // Load withdrawals (real-time)
  useEffect(() => {
    const q = query(collection(db, 'cardholderWithdrawals'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Withdrawal)))
    })
  }, [])

  // Load completed orders (real-time)
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

  const activeCount = cardholders.filter(c => c.status === 'active').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cardholder Activity</h1>
        <p className="text-gray-500 text-sm mt-1">
          Full financial history — received, withdrawn and current balance per cardholder. Toggle active/inactive directly from this view.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cardholders', value: cardholders.length, color: 'from-slate-50 to-slate-100', text: 'text-slate-900', sub: 'text-slate-500' },
          { label: 'Active', value: activeCount, color: 'from-green-50 to-green-100', text: 'text-green-900', sub: 'text-green-600' },
          { label: 'Completed Orders', value: orders.length, color: 'from-blue-50 to-blue-100', text: 'text-blue-900', sub: 'text-blue-600' },
          { label: 'Total Withdrawals', value: withdrawals.length, color: 'from-orange-50 to-orange-100', text: 'text-orange-900', sub: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-xl border border-gray-100 p-4`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${s.sub}`}>{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-bold text-gray-900">All Cardholders</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Click the status badge to activate or deactivate. Click ▼ History to see transaction detail.
          </p>
        </div>

        {cardholders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium">No cardholders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  {['Status', 'Name', 'Payment Method', 'Total Received', 'Total Withdrawn', 'Balance', ''].map(h => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cardholders.map(ch => (
                  <CardholderRow
                    key={ch.id + tick}
                    ch={ch}
                    method={paymentMethods.find(m => m.id === ch.paymentMethodId)}
                    allWithdrawals={withdrawals}
                    allOrders={orders}
                    onStatusChange={() => setTick(t => t + 1)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CardholderActivity
