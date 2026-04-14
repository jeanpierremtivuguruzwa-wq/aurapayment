import React, { useState } from 'react'
import { useUsers } from '../../hooks/useUsers'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions'

type Tab = 'overview' | 'orders' | 'transactions'

interface Props {
  userId: string
  onBack: () => void
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800 border-amber-200',
  uploaded:  'bg-sky-100 text-sky-800 border-sky-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_ICON: Record<string, string> = {
  pending:   '⏳',
  uploaded:  '📤',
  completed: '✅',
  cancelled: '❌',
}

function fmtDate(ts: any) {
  if (!ts) return 'N/A'
  try {
    const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return 'N/A' }
}

function fmtDateTime(ts: any) {
  if (!ts) return 'N/A'
  try {
    const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return 'N/A' }
}

function timeAgo(seconds: number) {
  if (!seconds) return 'Never'
  const diff = Math.floor(Date.now() / 1000) - seconds
  if (diff < 60)      return 'Just now'
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return fmtDate({ seconds })
}

const UserDashboardView: React.FC<Props> = ({ userId, onBack }) => {
  const [tab, setTab] = useState<Tab>('overview')

  const { users } = useUsers()
  const { orders } = useRealtimeOrders()
  const { transactions } = useRealtimeTransactions()

  const user = users.find(u => u.id === userId || u.uid === userId)
  const userOrders = orders.filter(o => o.userId === userId)
  const userTxns   = transactions.filter(t => t.userId === userId)

  // Stats
  const totalVolume    = userOrders.reduce((sum, o) => sum + (Number(o.sendAmount) || 0), 0)
  const completedOrders = userOrders.filter(o => o.status === 'completed').length
  const pendingOrders   = userOrders.filter(o => o.status === 'pending' || o.status === 'uploaded').length
  const cancelledOrders = userOrders.filter(o => o.status === 'cancelled').length
  const currenciesUsed  = [...new Set(userOrders.map(o => o.sendCurrency))].join(', ') || '—'
  const lastOrderTs     = userOrders.length > 0 ? (userOrders[0].createdAt?.seconds ?? 0) : 0

  const getInitials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)

  const status = user?.status || 'active'

  return (
    <div className="space-y-5">

      {/* ── Admin Preview Banner ── */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-sky-600 text-white px-5 py-3 rounded-2xl shadow-lg">
        <span className="text-2xl">👁</span>
        <div className="flex-1">
          <p className="font-semibold text-sm">Admin Preview Mode</p>
          <p className="text-indigo-100 text-xs">
            You are viewing <strong>{user?.fullName || user?.email || 'this user'}'s</strong> dashboard as an admin.
            No account changes are being made.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-white/30"
        >
          ← Back to Users
        </button>
      </div>

      {/* ── User Profile Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          {/* Avatar */}
          <div className="relative shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-20 h-20 rounded-full border-4 border-sky-100 object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold text-2xl border-4 border-sky-100">
                {getInitials(user?.fullName || user?.displayName || '')}
              </div>
            )}
            <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${
              status === 'active' ? 'bg-green-500' :
              status === 'suspended' ? 'bg-red-500' : 'bg-slate-400'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-slate-900">
                {user?.fullName || user?.displayName || '—'}
              </h2>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                user?.role === 'admin' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                user?.role === 'agent' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                         'bg-sky-50 text-sky-700 border-sky-200'
              }`}>
                {user?.role === 'admin' ? '🛡 Admin' : user?.role === 'agent' ? '🤝 Agent' : '👤 User'}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                status === 'active'    ? 'bg-green-100 text-green-800 border-green-200' :
                status === 'suspended' ? 'bg-red-100 text-red-700 border-red-200' :
                                         'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {status === 'active' ? '● Active' : status === 'suspended' ? '● Suspended' : '● Inactive'}
              </span>
            </div>
            <p className="text-slate-500 text-sm mb-3">{user?.email || '—'}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Phone</p>
                <p className="text-slate-700 font-medium">{user?.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Joined</p>
                <p className="text-slate-700 font-medium">{fmtDate(user?.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Order</p>
                <p className="text-slate-700 font-medium">{timeAgo(lastOrderTs)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">User ID</p>
                <p className="font-mono text-xs text-slate-500 truncate">{userId}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',    value: userOrders.length,  icon: '📦', bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-800'  },
          { label: 'Completed',       value: completedOrders,    icon: '✅', bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-800'  },
          { label: 'Pending',         value: pendingOrders,      icon: '⏳', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800'  },
          { label: 'Cancelled',       value: cancelledOrders,    icon: '❌', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700'    },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3.5 ${s.bg} ${s.border} flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className={`text-2xl font-bold leading-none ${s.text}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Total Volume + Currencies strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gradient-to-r from-sky-500 to-indigo-500 rounded-xl px-5 py-4 text-white">
          <p className="text-sky-100 text-xs font-medium uppercase tracking-wide mb-1">Total Volume Sent</p>
          <p className="text-3xl font-bold">
            {totalVolume > 0 ? totalVolume.toLocaleString() : '0'}
          </p>
          <p className="text-sky-200 text-xs mt-1">across all orders</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Currencies Used</p>
          <p className="text-slate-800 text-lg font-bold">{currenciesUsed}</p>
          <p className="text-slate-400 text-xs mt-1">{userTxns.length} transaction record{userTxns.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {([
            { key: 'overview',      label: 'Overview',      icon: '🏠' },
            { key: 'orders',        label: `Orders (${userOrders.length})`,           icon: '📦' },
            { key: 'transactions',  label: `Transactions (${userTxns.length})`,       icon: '📊' },
          ] as { key: Tab; label: string; icon: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? 'border-sky-500 text-sky-700 bg-sky-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── Overview Tab ── */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 text-sm">Recent Orders</h3>
              {userOrders.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">📭</div>
                  <p className="text-slate-500">No orders yet</p>
                  <p className="text-slate-400 text-xs mt-1">This user hasn't placed any orders.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userOrders.slice(0, 5).map(order => (
                    <div key={order.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{STATUS_ICON[order.status] ?? '📦'}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {order.sendAmount?.toLocaleString()} {order.sendCurrency} → {order.receiveAmount?.toLocaleString()} {order.receiveCurrency}
                          </p>
                          <p className="text-xs text-slate-400">{order.recipientName} · {fmtDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border capitalize ${STATUS_COLOR[order.status] ?? ''}`}>
                        {order.status}
                      </span>
                    </div>
                  ))}
                  {userOrders.length > 5 && (
                    <button
                      onClick={() => setTab('orders')}
                      className="w-full text-center text-xs text-sky-600 hover:text-sky-800 font-medium py-2"
                    >
                      View all {userOrders.length} orders →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Orders Tab ── */}
          {tab === 'orders' && (
            <div>
              {userOrders.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">📭</div>
                  <p className="text-slate-500">No orders found for this user.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Recipient</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Method</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-slate-500">{order.orderId || order.id.substring(0, 8)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">
                              {order.sendAmount?.toLocaleString()} {order.sendCurrency}
                            </div>
                            <div className="text-xs text-slate-400">
                              → {order.receiveAmount?.toLocaleString()} {order.receiveCurrency}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{order.recipientName || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                              {order.provider || order.paymentMethod || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border capitalize ${STATUS_COLOR[order.status] ?? ''}`}>
                              {STATUS_ICON[order.status]} {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {fmtDate(order.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Transactions Tab ── */}
          {tab === 'transactions' && (
            <div>
              {userTxns.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">📭</div>
                  <p className="text-slate-500">No transactions found for this user.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Transaction</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount Sent</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Received</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Recipient</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userTxns.map(txn => (
                        <tr key={txn.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-slate-500">{txn.id.substring(0, 8)}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {txn.amountSent?.toLocaleString()} {txn.currencySent}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {txn.amountReceived ? `${txn.amountReceived.toLocaleString()} ${txn.currencyReceived}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{txn.recipientName || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border capitalize ${STATUS_COLOR[txn.status] ?? ''}`}>
                              {STATUS_ICON[txn.status]} {txn.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {fmtDateTime(txn.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default UserDashboardView
