import React from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { PaymentMethod } from '../../types/PaymentMethod'
import { deletePaymentMethod, setActivePaymentMethod } from '../../services/paymentMethodService'
import CardForm from './CardForm'
import TotalReceived from './TotalReceived'

const PaymentMethods: React.FC = () => {
  const { data: methods, loading } = useFirestoreQuery<PaymentMethod>('paymentMethods')

  const handleSetActive = async (id: string) => {
    await setActivePaymentMethod(id)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this payment method?')) {
      await deletePaymentMethod(id)
    }
  }

  if (loading) return <div className="text-center py-8">Loading payment methods...</div>

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-xl font-semibold mb-4">💳 Payment Methods</h2>
      <div className="space-y-3 mb-6">
        {methods.map(method => (
          <div key={method.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{method.name}</div>
              <div className="text-sm text-gray-600">
                {method.type} | <TotalReceived id={method.id} initialTotal={method.totalReceived} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSetActive(method.id)}
                className={`px-3 py-1 rounded text-sm ${method.active ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
              >
                {method.active ? 'Active' : 'Set Active'}
              </button>
              <button onClick={() => handleDelete(method.id)} className="bg-red-600 text-white px-3 py-1 rounded text-sm">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <CardForm />
    </div>
  )
}

export default PaymentMethods