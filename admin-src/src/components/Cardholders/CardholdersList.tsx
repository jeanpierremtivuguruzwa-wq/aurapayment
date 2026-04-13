import React, { useState } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import { deleteCardholder, setActiveCardholder } from '../../services/cardholderService'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'

interface EditingState {
  id: string | null
  data: any
}

const CardholdersList: React.FC = () => {
  const { data: cardholders, loading } = useFirestoreQuery<Cardholder>('cardholders', 'createdAt')
  const { data: paymentMethods } = useFirestoreQuery<PaymentMethod>('paymentMethods')
  
  const [editing, setEditing] = useState<EditingState>({ id: null, data: {} })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getPaymentMethodName = (methodId: string) => {
    return paymentMethods.find(m => m.id === methodId)?.name || 'Unknown'
  }

  const getPaymentMethodIcon = (methodId: string) => {
    const method = paymentMethods.find(m => m.id === methodId)
    switch (method?.type) {
      case 'bank': return '🏦'
      case 'mobile': return '📱'
      case 'cash': return '💵'
      default: return '💳'
    }
  }

  const handleEdit = (cardholder: Cardholder) => {
    setEditing({
      id: cardholder.id,
      data: {
        fullName: cardholder.accountHolder || '',
        displayName: cardholder.displayName || '',
        accountNumber: cardholder.accountNumber || '',
        phoneNumber: cardholder.phoneNumber || '',
        balance: cardholder.balance || 0
      }
    })
  }

  const handleSaveEdit = async (cardholderId: string) => {
    try {
      setIsSubmitting(true)
      const ref = doc(db, 'cardholders', cardholderId)
      await updateDoc(ref, {
        accountHolder: editing.data.fullName,
        displayName: editing.data.displayName,
        accountNumber: editing.data.accountNumber || undefined,
        phoneNumber: editing.data.phoneNumber || undefined,
        balance: editing.data.balance,
        updatedAt: new Date()
      })
      setEditing({ id: null, data: {} })
      alert('✓ Cardholder updated!')
    } catch (err) {
      alert('Error: ' + (err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetActive = async (cardholderId: string, paymentMethodId: string) => {
    try {
      await setActiveCardholder(paymentMethodId, cardholderId)
      alert('✓ Cardholder activated!')
    } catch (err) {
      alert('Error: ' + (err as Error).message)
    }
  }

  const handleDelete = async (cardholderId: string) => {
    if (confirm('Delete this cardholder?')) {
      try {
        await deleteCardholder(cardholderId)
        alert('✓ Cardholder deleted!')
      } catch (err) {
        alert('Error: ' + (err as Error).message)
      }
    }
  }

  if (loading) {
    return (
      <div className="card-base p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    )
  }

  // Calculate statistics
  const totalCardholders = cardholders.length
  const activeCardholders = cardholders.filter(c => c.status === 'active').length
  const totalBalance = cardholders.reduce((sum, c) => sum + ((c.balance || 0) as number), 0)
  const totalTransactions = cardholders.reduce((sum, c) => sum + (c.transactionsCount || 0), 0)

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-base p-4 bg-gradient-to-br from-slate-50 to-slate-100">
          <p className="text-xs font-semibold text-slate-600 uppercase">Total Cards</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{totalCardholders}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-green-50 to-green-100">
          <p className="text-xs font-semibold text-green-600 uppercase">Active</p>
          <p className="text-3xl font-bold text-green-900 mt-2">{activeCardholders}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-blue-50 to-blue-100">
          <p className="text-xs font-semibold text-blue-600 uppercase">Total Balance</p>
          <p className="text-2xl font-bold text-blue-900 mt-2">₽{totalBalance.toFixed(2)}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-purple-50 to-purple-100">
          <p className="text-xs font-semibold text-purple-600 uppercase">Transactions</p>
          <p className="text-3xl font-bold text-purple-900 mt-2">{totalTransactions}</p>
        </div>
      </div>

      {/* Management Section */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold">💳 Cardholders</h2>
            <p className="text-xs text-slate-500 mt-1">Auto-synced from Payment Methods — 1 cardholder per method</p>
          </div>
        </div>

        {/* Cardholders Table */}
        {cardholders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p className="text-lg">No cardholders yet</p>
            <p className="text-sm mt-2 text-slate-400">Add a payment method to automatically create a cardholder</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-sm">Full Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-sm">Display Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-sm">Payment Method</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-sm">Account #</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-sm">Balance</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700 text-sm">Transactions</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700 text-sm">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700 text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cardholders.map((cardholder) => (
                  <tr key={cardholder.id} className="border-b border-slate-200 hover:bg-slate-50">
                    {/* Full Name */}
                    <td className="py-3 px-4">
                      {editing.id === cardholder.id ? (
                        <input
                          type="text"
                          value={editing.data.fullName}
                          onChange={(e) => setEditing({ ...editing, data: { ...editing.data, fullName: e.target.value } })}
                          className="input-base w-full text-sm"
                          disabled={isSubmitting}
                        />
                      ) : (
                        <span className="font-medium text-slate-900">{cardholder.accountHolder}</span>
                      )}
                    </td>

                    {/* Display Name */}
                    <td className="py-3 px-4">
                      {editing.id === cardholder.id ? (
                        <input
                          type="text"
                          value={editing.data.displayName}
                          onChange={(e) => setEditing({ ...editing, data: { ...editing.data, displayName: e.target.value } })}
                          className="input-base w-full text-sm"
                          disabled={isSubmitting}
                        />
                      ) : (
                        <span className="text-slate-700">{cardholder.displayName}</span>
                      )}
                    </td>

                    {/* Payment Method */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        {getPaymentMethodIcon(cardholder.paymentMethodId)}
                        <span className="text-sm">{getPaymentMethodName(cardholder.paymentMethodId)}</span>
                      </span>
                    </td>

                    {/* Account Number */}
                    <td className="py-3 px-4">
                      {editing.id === cardholder.id ? (
                        <input
                          type="text"
                          value={editing.data.accountNumber}
                          onChange={(e) => setEditing({ ...editing, data: { ...editing.data, accountNumber: e.target.value } })}
                          className="input-base w-full text-sm"
                          disabled={isSubmitting}
                        />
                      ) : (
                        <span className="font-mono text-sm text-slate-600">{cardholder.accountNumber || '—'}</span>
                      )}
                    </td>

                    {/* Balance */}
                    <td className="py-3 px-4">
                      {editing.id === cardholder.id ? (
                        <input
                          type="number"
                          value={editing.data.balance}
                          onChange={(e) => setEditing({ ...editing, data: { ...editing.data, balance: parseFloat(e.target.value) || 0 } })}
                          step="0.01"
                          className="input-base w-full text-sm"
                          disabled={isSubmitting}
                        />
                      ) : (
                        <span className="font-semibold text-green-600">₽{(cardholder.balance || 0).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Transactions */}
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                        {cardholder.transactionsCount || 0}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          cardholder.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {cardholder.status === 'active' ? '✓ Active' : '○ Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {editing.id === cardholder.id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(cardholder.id)}
                              disabled={isSubmitting}
                              className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              title="Save changes"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditing({ id: null, data: {} })}
                              disabled={isSubmitting}
                              className="text-sm px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                              title="Cancel editing"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEdit(cardholder)}
                              className="text-sm px-2 py-1 bg-sky-100 text-sky-700 rounded hover:bg-sky-200"
                              title="Edit cardholder"
                            >
                              ✏️
                            </button>
                            {cardholder.status !== 'active' && (
                              <button
                                onClick={() => handleSetActive(cardholder.id, cardholder.paymentMethodId)}
                                className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                title="Set as active"
                              >
                                ✓
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(cardholder.id)}
                              className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                              title="Delete cardholder"
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CardholdersList
