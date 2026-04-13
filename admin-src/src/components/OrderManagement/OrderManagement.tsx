import React from 'react'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { db } from '../../services/firebase'
import { doc, updateDoc, Timestamp, increment, collection, query, where, getDocs } from 'firebase/firestore'

const OrderManagement: React.FC = () => {
  const { orders, loading, error } = useRealtimeOrders()
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const handleCancelOrder = async (orderId: string) => {
    if (confirm('Are you sure you want to cancel this order?')) {
      try {
        const orderRef = doc(db, 'orders', orderId)
        await updateDoc(orderRef, {
          status: 'cancelled',
          cancelledAt: Timestamp.now(),
        })
        alert('Order cancelled successfully')
      } catch (err) {
        alert('Error cancelling order: ' + (err as Error).message)
      }
    }
  }

  const handleCompleteOrder = async (orderId: string) => {
    if (confirm('Mark this order as completed?')) {
      try {
        const order = orders.find(o => o.id === orderId)
        if (!order) throw new Error('Order not found')

        // 1. Mark the order as completed
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'completed',
          completedAt: Timestamp.now(),
        })

        // 2. Update the linked cardholder: add sendAmount to balance, increment transactionsCount
        if (order.paymentMethod) {
          const cardholderQ = query(
            collection(db, 'cardholders'),
            where('paymentMethodId', '==', order.paymentMethod),
            where('status', '==', 'active')
          )
          const cardholderSnap = await getDocs(cardholderQ)
          if (!cardholderSnap.empty) {
            await updateDoc(doc(db, 'cardholders', cardholderSnap.docs[0].id), {
              balance: increment(order.sendAmount),
              transactionsCount: increment(1),
              updatedAt: new Date(),
            })
          }

          // 3. Update payment method totalReceived
          await updateDoc(doc(db, 'paymentMethods', order.paymentMethod), {
            totalReceived: increment(order.sendAmount),
          })
        }

        alert('Order marked as completed')
      } catch (err) {
        alert('Error completing order: ' + (err as Error).message)
      }
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'N/A'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800'
      case 'uploaded':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
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
        <p className="text-red-600">Error loading orders: {error}</p>
      </div>
    )
  }

  return (
    <div className="card-base p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold">📦 Order Management</h2>
        <span className="text-sm font-medium text-slate-500">{orders.length} orders</span>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-lg">No orders yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">User</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Transaction ID</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orders.map((order) => (
                <React.Fragment key={order.id}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 text-slate-900">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="text-slate-900 font-medium">{order.userEmail}</div>
                      <div className="text-xs text-slate-500">{order.userId.substring(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-4">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-900">
                        {order.id.substring(0, 12)}...
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-900">
                        {order.sendAmount.toFixed(2)} {order.sendCurrency}
                      </div>
                      <div className="text-xs text-slate-500">
                        → {(order.sendAmount * order.rate).toFixed(2)} {order.receiveCurrency}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        className="text-sky-600 hover:text-sky-700 font-medium text-xs"
                      >
                        {expandedId === order.id ? 'Hide' : 'View'} Details
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Row */}
                  {expandedId === order.id && (
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-4">
                          {/* Order Details */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-slate-600 uppercase">Recipient Name</label>
                              <p className="text-slate-900 font-medium mt-1">{order.recipientName}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600 uppercase">Provider</label>
                              <p className="text-slate-900 font-medium mt-1">{order.provider}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600 uppercase">Delivery Method</label>
                              <p className="text-slate-900 font-medium mt-1 capitalize">{order.deliveryMethod}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600 uppercase">Exchange Rate</label>
                              <p className="text-slate-900 font-medium mt-1">
                                1 {order.sendCurrency} = {order.rate.toFixed(2)} {order.receiveCurrency}
                              </p>
                            </div>
                          </div>

                          {/* Contact Details */}
                          {order.phoneNumber && (
                            <div className="bg-white px-4 py-3 rounded-lg border border-slate-200">
                              <label className="text-xs font-semibold text-slate-600 uppercase">Phone Number</label>
                              <p className="text-slate-900 font-medium mt-1">{order.phoneNumber}</p>
                            </div>
                          )}

                          {order.accountNumber && (
                            <div className="bg-white px-4 py-3 rounded-lg border border-slate-200">
                              <label className="text-xs font-semibold text-slate-600 uppercase">Account Number</label>
                              <p className="text-slate-900 font-medium mt-1">{order.accountNumber}</p>
                            </div>
                          )}

                          {/* Timestamps */}
                          <div className="flex gap-4 text-xs text-slate-600">
                            <span>Created: {formatDate(order.createdAt)}</span>
                            {order.completedAt && <span>Completed: {formatDate(order.completedAt)}</span>}
                            {order.cancelledAt && <span>Cancelled: {formatDate(order.cancelledAt)}</span>}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-2">
                            {(order.status === 'pending' || order.status === 'uploaded') && (
                              <>
                                <button
                                  onClick={() => handleCompleteOrder(order.id)}
                                  className="btn-primary text-xs"
                                >
                                  ✓ Mark Completed
                                </button>
                                <button
                                  onClick={() => handleCancelOrder(order.id)}
                                  className="btn-secondary text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                >
                                  ✕ Cancel Order
                                </button>
                              </>
                            )}
                            {order.status === 'uploaded' && (
                              <span className="text-blue-600 font-medium text-xs">📎 Proof Uploaded — Awaiting Approval</span>
                            )}
                            {order.status === 'completed' && (
                              <span className="text-green-600 font-medium text-xs">✓ Order Completed</span>
                            )}
                            {order.status === 'cancelled' && (
                              <span className="text-red-600 font-medium text-xs">✕ Order Cancelled</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default OrderManagement
