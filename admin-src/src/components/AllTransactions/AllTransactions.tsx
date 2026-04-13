import React, { useState } from 'react'
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../../services/firebase'

const AllTransactions: React.FC = () => {
  const { transactions } = useRealtimeTransactions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [proofModal, setProofModal] = useState<{ url: string } | null>(null)
  const [loadingProofId, setLoadingProofId] = useState<string | null>(null)

  const openProof = async (proofFileName: string, txId: string) => {
    try {
      setLoadingProofId(txId)
      const url = await getDownloadURL(ref(storage, `proofs/${proofFileName}`))
      setProofModal({ url })
    } catch {
      alert('Could not load proof image.')
    } finally {
      setLoadingProofId(null)
    }
  }

  const linkedTransactions = transactions

  const stats = {
    total: linkedTransactions.length,
    completed: linkedTransactions.filter((t) => t.status === 'completed').length,
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

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'N/A'
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <div className="card-base p-4 bg-gradient-to-br from-slate-50 to-slate-100">
            <p className="text-xs font-semibold text-slate-600 uppercase">Total Transactions</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total}</p>
          </div>
          <div className="card-base p-4 bg-gradient-to-br from-green-50 to-green-100">
            <p className="text-xs font-semibold text-green-600 uppercase">Completed</p>
            <p className="text-3xl font-bold text-green-900 mt-2">{stats.completed}</p>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="card-base p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
            <h2 className="text-xl font-semibold">✓ All Transactions</h2>
            <span className="text-sm font-medium text-slate-500">{linkedTransactions.length} transactions</span>
          </div>

          {linkedTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 text-lg">No linked transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date & Time</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Transaction ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {linkedTransactions.map((tx) => (
                    <React.Fragment key={tx.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-4 text-slate-900">
                          <div>{tx.timestamp ? formatDate(tx.timestamp).split(' ')[0] : 'N/A'}</div>
                          <div className="text-xs text-slate-500">{tx.timestamp ? formatTime(tx.timestamp) : 'N/A'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-slate-900 font-medium">{tx.recipientName || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">
                            {(tx as any).userId ? (tx as any).userId.substring(0, 8) + '...' : 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-900">
                            {tx.id.substring(0, 12)}...
                          </code>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">
                            {tx.amountSent?.toFixed(2) || '0.00'} {tx.currencySent}
                          </div>
                          <div className="text-xs text-slate-500">
                            → {tx.amountReceived?.toFixed(2) || '0.00'} {tx.currencyReceived}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            ✓ {tx.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                            className="text-sky-600 hover:text-sky-700 font-medium text-xs"
                          >
                            {expandedId === tx.id ? 'Hide' : 'View'} Details
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedId === tx.id && (
                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="space-y-4">
                              {/* Transaction Details */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Recipient Name</label>
                                  <p className="text-slate-900 font-medium mt-1">{tx.recipientName || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Provider</label>
                                  <p className="text-slate-900 font-medium mt-1">{tx.provider || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Payment Method</label>
                                  <p className="text-slate-900 font-medium mt-1">{tx.paymentMethod || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Amount Sent</label>
                                  <p className="text-slate-900 font-medium mt-1">
                                    {tx.amountSent?.toFixed(2) || '0.00'} {tx.currencySent}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Amount Received</label>
                                  <p className="text-slate-900 font-medium mt-1">
                                    {tx.amountReceived?.toFixed(2) || '0.00'} {tx.currencyReceived}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-slate-600 uppercase">Status</label>
                                  <p className="text-slate-900 font-medium mt-1 capitalize">{tx.status}</p>
                                </div>
                              </div>

                              {/* Timestamp */}
                              <div className="flex gap-4 text-xs text-slate-600 bg-white px-4 py-3 rounded-lg border border-slate-200">
                                <span>Created: {formatDate(tx.timestamp)}</span>
                              </div>

                              {/* Proof of Payment */}
                              {tx.proofFileName && (
                                <div className="bg-white px-4 py-3 rounded-lg border border-slate-200">
                                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">
                                    Proof of Payment
                                  </label>
                                  <button
                                    onClick={() => openProof(tx.proofFileName!, tx.id)}
                                    disabled={loadingProofId === tx.id}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                                  >
                                    {loadingProofId === tx.id ? '⏳ Loading...' : '🖼 View Uploaded Proof'}
                                  </button>
                                </div>
                              )}
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
      </div>

      {/* Proof Image Modal */}
      {proofModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setProofModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold">🖼 Proof of Payment</h3>
              <button
                onClick={() => setProofModal(null)}
                className="text-slate-500 hover:text-slate-800 text-2xl font-bold leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <img
                src={proofModal.url}
                alt="Proof of payment"
                className="w-full rounded-lg object-contain max-h-[70vh]"
              />
            </div>
            <div className="px-6 pb-4 flex justify-end">
              <a
                href={proofModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:text-sky-700 text-sm font-medium"
              >
                Open full size ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AllTransactions
