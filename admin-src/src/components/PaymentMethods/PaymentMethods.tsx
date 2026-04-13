import React, { useState } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { PaymentMethod } from '../../types/PaymentMethod'
import { deletePaymentMethod, setActivePaymentMethod, deactivatePaymentMethod } from '../../services/paymentMethodService'
import CardForm from './CardForm'
import EditMethodForm from './EditMethodForm'

const PaymentMethods: React.FC = () => {
  const { data: methods, loading } = useFirestoreQuery<PaymentMethod>('paymentMethods', 'createdAt')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)

  const handleSetActive = async (id: string) => {
    try {
      await setActivePaymentMethod(id)
      alert('Payment method activated!')
    } catch (error) {
      alert('Error activating payment method: ' + (error as Error).message)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      await deactivatePaymentMethod(id)
      alert('Payment method deactivated!')
    } catch (error) {
      alert('Error deactivating payment method: ' + (error as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this payment method?')) {
      await deletePaymentMethod(id)
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bank': return '🏦'
      case 'mobile': return '📱'
      case 'cash': return '💵'
      default: return '💳'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'bank': return 'Bank Transfer'
      case 'mobile': return 'Mobile Money'
      case 'cash': return 'Cash Pickup'
      default: return type
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

  // Calculate statistics
  const activeMethod = methods.find(m => m.active)
  const totalReceived = methods.reduce((sum, method) => sum + (method.totalReceived || 0), 0)

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-base p-4 bg-gradient-to-br from-slate-50 to-slate-100">
          <p className="text-xs font-semibold text-slate-600 uppercase">Total Methods</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{methods.length}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-green-50 to-green-100">
          <p className="text-xs font-semibold text-green-600 uppercase">Active</p>
          <p className="text-2xl font-bold text-green-900 mt-2">{activeMethod?.name || 'None'}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-blue-50 to-blue-100">
          <p className="text-xs font-semibold text-blue-600 uppercase">Total Received</p>
          <p className="text-2xl font-bold text-blue-900 mt-2">₽{totalReceived.toFixed(2)}</p>
        </div>
        <div className="card-base p-4 bg-gradient-to-br from-purple-50 to-purple-100">
          <p className="text-xs font-semibold text-purple-600 uppercase">Bank Methods</p>
          <p className="text-3xl font-bold text-purple-900 mt-2">{methods.filter(m => m.type === 'bank').length}</p>
        </div>
      </div>

      {/* Payment Methods List */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold">💳 Payment Methods</h2>
          <span className="text-sm font-medium text-slate-500">{methods.length} configured</span>
        </div>

        {methods.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-lg">No payment methods yet</p>
            <p className="text-slate-400 text-sm mt-2">Add one below to get started</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {methods.map(method => (
              <div key={method.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">{getTypeIcon(method.type)}</div>
                    <div>
                      <div className="font-semibold text-slate-900">{method.name}</div>
                      <div className="text-xs text-slate-500">
                        {getTypeLabel(method.type)} · {method.currency}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {method.active && (
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        ✓ Active
                      </span>
                    )}
                    <button
                      onClick={() => setExpandedId(expandedId === method.id ? null : method.id)}
                      className="text-sky-600 hover:text-sky-700 font-medium text-xs"
                    >
                      {expandedId === method.id ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === method.id && (
                  <div className="bg-slate-50 border-t border-slate-200 pt-4 mt-4 space-y-4">
                    {/* Basic Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase">Type</label>
                        <p className="text-slate-900 font-medium mt-1 capitalize">{getTypeLabel(method.type)}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase">Currency</label>
                        <p className="text-slate-900 font-medium mt-1">{method.currency}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase">Processing Time</label>
                        <p className="text-slate-900 font-medium mt-1">{method.processingTime || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase">Fees</label>
                        <p className="text-slate-900 font-medium mt-1">{method.fees ? method.fees + '%' : 'Free'}</p>
                      </div>
                    </div>

                    {/* Description */}
                    {method.description && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <label className="text-xs font-semibold text-slate-600 uppercase">Description</label>
                        <p className="text-slate-700 text-sm mt-2">{method.description}</p>
                      </div>
                    )}

                    {/* Bank Details */}
                    {method.type === 'bank' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-3">🏦 Bank Account</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-blue-600 font-semibold text-xs uppercase">Account Holder</span>
                            <p className="text-blue-900 font-medium mt-1">{method.accountHolder || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-blue-600 font-semibold text-xs uppercase">Account Number</span>
                            <p className="text-blue-900 font-medium mt-1 font-mono">{method.accountNumber || 'N/A'}</p>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* Mobile Money Details */}
                    {method.type === 'mobile' && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <h4 className="font-semibold text-purple-900 mb-3">📱 Mobile Money Account</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-purple-600 font-semibold text-xs uppercase">Account Holder</span>
                            <p className="text-purple-900 font-medium mt-1">{method.accountHolder || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-purple-600 font-semibold text-xs uppercase">Phone Number</span>
                            <p className="text-purple-900 font-medium mt-1 font-mono">{method.phoneNumber || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Total Received */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <label className="text-xs font-semibold text-green-600 uppercase">Total Received</label>
                      <p className="text-green-900 font-medium mt-1 text-lg">₽{method.totalReceived?.toFixed(2) || '0.00'}</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-4 flex-wrap border-t border-slate-200">
                      <button
                        onClick={() => setEditingMethod(method)}
                        className="btn-primary text-xs flex items-center gap-1"
                      >
                        ✏️ Edit Details
                      </button>
                      {!method.active && (
                        <button
                          onClick={() => handleSetActive(method.id)}
                          className="btn-primary text-xs bg-green-50 text-green-600 border border-green-200 hover:bg-green-100"
                        >
                          ✓ Activate
                        </button>
                      )}
                      {method.active && (
                        <button
                          onClick={() => handleDeactivate(method.id)}
                          className="btn-secondary text-xs bg-yellow-50 text-yellow-600 border border-yellow-200 hover:bg-yellow-100"
                        >
                          ○ Deactivate
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(method.id)}
                        className="btn-secondary text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                      >
                        🗑 Delete Method
                      </button>
                    </div>

                    {/* Info message about Cardholders */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-4">
                      <p className="text-xs text-purple-900">
                        💡 <strong>Tip:</strong> Go to <strong>Cardholders</strong> page to add account holders for this payment method
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Payment Method */}
      <CardForm />

      {/* Edit Modal */}
      {editingMethod && (
        <EditMethodForm
          method={editingMethod}
          onClose={() => setEditingMethod(null)}
          onSaved={() => {
            setEditingMethod(null)
            // The data will refresh automatically via useFirestoreQuery
          }}
        />
      )}
    </div>
  )
}

export default PaymentMethods
