import React from 'react'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { db, storage } from '../../services/firebase'
import { doc, updateDoc, Timestamp, increment, collection, query, where, getDocs, runTransaction } from 'firebase/firestore'
import { ref, getDownloadURL } from 'firebase/storage'
import { Agent } from '../../types/Agent'
import { AlertTriangle, Package, Inbox, Hand, Image, Download } from 'lucide-react'

interface Props {
  /** When passed, the component runs in "agent mode" — filtering & claim rules apply */
  agent?: Agent | null
  /** When true (admin), all orders are visible regardless of who claimed them */
  isAdmin?: boolean
}

const OrderManagement: React.FC<Props> = ({ agent = null, isAdmin = false }) => {
  const { orders, loading, error } = useRealtimeOrders()
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState<string | null>(null)
  const [proofModal, setProofModal] = React.useState<{ url: string; name: string; isPdf: boolean } | null>(null)
  const [proofLoading, setProofLoading] = React.useState<string | null>(null)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  // For agents: only show orders that are unclaimed OR claimed by me
  // For admins: show all orders
  const visibleOrders = React.useMemo(() => {
    if (isAdmin || !agent) return orders   // admin sees everything
    return orders.filter(o =>
      !o.claimedBy || o.claimedBy === agent.id
    )
  }, [orders, agent, isAdmin])

  const viewProof = async (proofFileName: string) => {
    setProofLoading(proofFileName)
    try {
      const url = await getDownloadURL(ref(storage, `proofs/${proofFileName}`))
      const isPdf = proofFileName.toLowerCase().endsWith('.pdf')
      setProofModal({ url, name: proofFileName, isPdf })
    } catch (err) {
      alert('Could not load proof file: ' + (err as Error).message)
    } finally {
      setProofLoading(null)
    }
  }

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  /** Atomically claim an order — fails if someone else already claimed it */
  const handleClaimOrder = async (orderId: string) => {
    if (!agent && !isAdmin) return
    const claimerId = agent ? agent.id : 'admin'
    const claimerName = agent ? agent.name : 'Admin'
    setActionLoading(orderId)
    try {
      const orderRef = doc(db, 'orders', orderId)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(orderRef)
        if (!snap.exists()) throw new Error('Order not found')
        const data = snap.data()
        if (data.claimedBy && data.claimedBy !== claimerId) {
          throw new Error('This order was just claimed by another agent.')
        }
        tx.update(orderRef, {
          claimedBy: claimerId,
          claimedByName: claimerName,
          claimedAt: Timestamp.now(),
        })
      })
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    setActionLoading(orderId)
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        cancelledAt: Timestamp.now(),
      })
    } catch (err) {
      alert('Error cancelling order: ' + (err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCompleteOrder = async (orderId: string) => {
    if (!confirm('Mark this order as completed?')) return
    setActionLoading(orderId)
    try {
      const order = orders.find(o => o.id === orderId)
      if (!order) throw new Error('Order not found')

      await updateDoc(doc(db, 'orders', orderId), {
        status: 'completed',
        completedAt: Timestamp.now(),
      })

      if (order.paymentMethod) {
        const cardholderQ = query(
          collection(db, 'cardholders'),
          where('paymentMethodId', '==', order.paymentMethod)
        )
        const cardholderSnap = await getDocs(cardholderQ)
        for (const chDoc of cardholderSnap.docs) {
          await updateDoc(doc(db, 'cardholders', chDoc.id), {
            balance: increment(order.sendAmount || 0),
            totalReceived: increment(order.sendAmount || 0),
            transactionsCount: increment(1),
            updatedAt: new Date(),
          })
        }
        await updateDoc(doc(db, 'paymentMethods', order.paymentMethod), {
          totalReceived: increment(order.sendAmount || 0),
        })
      }
    } catch (err) {
      alert('Error completing order: ' + (err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'N/A'
    }
  }

  const fmt = (val: any, decimals = 2) => {
    const n = parseFloat(val)
    return isNaN(n) ? '—' : n.toFixed(decimals)
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending:   'bg-amber-100 text-amber-800 border border-amber-200',
      uploaded:  'bg-blue-100 text-blue-800 border border-blue-200',
      completed: 'bg-green-100 text-green-800 border border-green-200',
      cancelled: 'bg-red-100 text-red-800 border border-red-200',
    }
    const label = status.charAt(0).toUpperCase() + status.slice(1)
    const cls = map[status] || 'bg-slate-100 text-slate-700 border border-slate-200'
    return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
  }

  if (loading) {
    return (
      <div className="card-base p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-32 bg-slate-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-base p-6 bg-red-50 border border-red-200">
        <p className="text-red-700 font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Error loading orders</p>
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 btn-primary text-sm">Retry</button>
      </div>
    )
  }

  const myId = agent ? agent.id : 'admin'

  return (
    <div className="card-base p-6">
      {/* Proof Viewer Modal */}
      {proofModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setProofModal(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div>
                <p className="font-semibold text-slate-900 text-sm">Payment Proof</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-xs">{proofModal.name}</p>
              </div>
              <div className="flex gap-2">
                <a
                  href={proofModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  ⬇ Open in New Tab
                </a>
                <a
                  href={proofModal.url}
                  download
                  className="text-xs bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5 inline mr-1" />Download
                </a>
                <button
                  onClick={() => setProofModal(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl leading-none font-bold px-2"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 p-4">
              {proofModal.isPdf ? (
                <iframe
                  src={proofModal.url}
                  className="w-full h-[70vh] rounded"
                  title="Proof PDF"
                />
              ) : (
                <img
                  src={proofModal.url}
                  alt="Payment proof"
                  className="max-w-full max-h-[70vh] rounded-lg shadow object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Package className="w-5 h-5 text-slate-600" /> Order Management</h2>
        <span className="text-sm font-medium text-slate-500">{visibleOrders.length} orders</span>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="text-center py-12">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 text-lg">No orders available</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200">
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Date</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Transaction ID</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">User Name</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Amount Sent</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Amount Received</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Claimed By</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOrders.map((order) => {
                const status = order.status || 'pending'
                const sendAmount = order.sendAmount ?? 0
                const rate = order.rate ?? 0
                const receiveAmount = (order as any).receiveAmount ?? (sendAmount * rate)
                const senderName = (order as any).senderName || order.userEmail || '—'
                const recipientName = order.recipientName || '—'

                const isActive = status === 'pending' || status === 'uploaded'
                const claimedBy = order.claimedBy || null
                const isMine = claimedBy === myId
                const isUnclaimed = !claimedBy
                // Admins can always act; agents only if they claimed
                const canAct = isActive && (isAdmin || isMine)
                const isLoading = actionLoading === order.id

                return (
                  <React.Fragment key={order.id}>
                    <tr className={`hover:bg-slate-50 transition-colors ${isMine ? 'bg-sky-50/40' : ''}`}>
                      {/* Date */}
                      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>

                      {/* Transaction ID */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {order.id}
                          </code>
                          <button
                            onClick={() => copyId(order.id)}
                            title="Copy ID"
                            className="text-slate-400 hover:text-slate-700 text-xs shrink-0"
                          >
                            {copied === order.id ? '✓' : '⎘'}
                          </button>
                        </div>
                      </td>

                      {/* User Name */}
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900">{senderName}</div>
                        <div className="text-xs text-slate-500">→ {recipientName}</div>
                      </td>

                      {/* Amount Sent */}
                      <td className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {fmt(sendAmount)} <span className="text-slate-500 font-normal">{order.sendCurrency || ''}</span>
                      </td>

                      {/* Amount Received */}
                      <td className="px-3 py-3 font-semibold text-emerald-700 whitespace-nowrap">
                        {fmt(receiveAmount)} <span className="text-emerald-600 font-normal">{order.receiveCurrency || ''}</span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">{statusBadge(status)}</td>

                      {/* Claimed By */}
                      <td className="px-3 py-3">
                        {claimedBy ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isMine
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-violet-100 text-violet-700'
                          }`}>
                            {isMine ? '★ You' : (order.claimedByName || claimedBy)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unclaimed</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 flex-wrap items-center">
                          {/* Claim button — shown when unclaimed and order is active */}
                          {isActive && isUnclaimed && (
                            <button
                              disabled={isLoading}
                              onClick={() => handleClaimOrder(order.id)}
                              className="bg-sky-600 hover:bg-sky-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                            {isLoading ? '…' : <><Hand className="w-3.5 h-3.5 inline mr-1" />Claim</>}
                            </button>
                          )}

                          {/* Complete / Cancel — only for claimer or admin */}
                          {canAct && (
                            <>
                              <button
                                disabled={isLoading}
                                onClick={() => handleCompleteOrder(order.id)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                              >
                                {isLoading ? '…' : '✓ Complete'}
                              </button>
                              <button
                                disabled={isLoading}
                                onClick={() => handleCancelOrder(order.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                              >
                                {isLoading ? '…' : '✕ Cancel'}
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                            className="text-sky-600 hover:text-sky-800 text-xs px-2 py-1.5 rounded-lg border border-sky-200 bg-sky-50 font-medium transition-colors"
                          >
                            {expandedId === order.id ? '▲ Hide' : '▼ Details'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details Row */}
                    {expandedId === order.id && (() => {
                      const providerDisplay = (order as any).providerName || order.provider || '—'
                      const destFlag = (order as any).flag || ''
                      const destCountry = (order as any).country || ''
                      const destCurrency = order.receiveCurrency || ''
                      const isBank = (order.deliveryMethod as string) === 'bank' || order.deliveryMethod === 'bank-transfer'
                      const isMobile = (order.deliveryMethod as string) === 'mobile' || order.deliveryMethod === 'mobile-money'
                      return (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-6 py-5">

                          {/* ── Top grid: key transaction info ── */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Destination</p>
                              <p className="text-slate-900 font-semibold text-sm">
                                {destFlag && <span className="mr-1">{destFlag}</span>}
                                {destCountry || destCurrency}
                              </p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{destCurrency}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Recipient</p>
                              <p className="text-slate-900 font-medium text-sm">{order.recipientName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Delivery Method</p>
                              <p className="text-slate-900 font-medium text-sm capitalize">
                                {isBank ? '🏦 Bank Transfer' : isMobile ? '📱 Mobile Money' : order.deliveryMethod || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Exchange Rate</p>
                              <p className="text-slate-900 font-medium text-sm">
                                {rate ? `1 ${order.sendCurrency} = ${fmt(rate, 4)} ${destCurrency}` : '—'}
                              </p>
                            </div>
                          </div>

                          {/* ── Recipient bank / mobile details ── */}
                          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                              {isBank ? '🏦 Recipient Bank Details' : isMobile ? '📱 Mobile Money Details' : 'Recipient Details'}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs text-slate-500 mb-0.5">{isBank ? 'Bank' : 'Provider'}</p>
                                <p className="font-semibold text-slate-900">{providerDisplay}</p>
                              </div>
                              {order.accountNumber && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-0.5">Account Number</p>
                                  <p className="font-semibold text-slate-900 font-mono">{order.accountNumber}</p>
                                </div>
                              )}
                              {order.phoneNumber && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-0.5">Phone Number</p>
                                  <p className="font-semibold text-slate-900">{order.phoneNumber}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── Proof + payment method ── */}
                          <div className="flex gap-3 flex-wrap mb-4">
                            {order.paymentMethod && (
                              <div className="bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <span className="text-xs text-slate-500 block">Payment Method</span>
                                <span className="font-mono text-xs">{order.paymentMethod}</span>
                              </div>
                            )}
                            {order.proofFileName && (
                              <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-blue-600 block">Proof File</span>
                                  <span className="font-medium text-blue-900 text-xs truncate block">{order.proofFileName}</span>
                                </div>
                                <button
                                  onClick={() => viewProof(order.proofFileName!)}
                                  disabled={proofLoading === order.proofFileName}
                                  className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                                >
                                  {proofLoading === order.proofFileName ? 'Loading…' : <><Image className="w-3.5 h-3.5 inline mr-1" />View Proof</>}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-slate-400 flex gap-4 flex-wrap">
                            <span>Created: {formatDate(order.createdAt)}</span>
                            {order.claimedAt && (
                              <span className="text-sky-600">Claimed by {order.claimedByName || order.claimedBy}: {formatDate(order.claimedAt)}</span>
                            )}
                            {order.completedAt && <span className="text-green-700">Completed: {formatDate(order.completedAt)}</span>}
                            {order.cancelledAt && <span className="text-red-600">Cancelled: {formatDate(order.cancelledAt)}</span>}
                          </div>
                        </td>
                      </tr>
                      )
                    })()}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default OrderManagement
