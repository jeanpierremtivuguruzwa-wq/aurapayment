import React, { useState, useEffect } from 'react'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import { listenToCardholders, setActiveCardholder, deleteCardholder, addCardholder } from '../../services/cardholderService'

interface Props {
  paymentMethod: PaymentMethod
  onClose: () => void
}

const CardholderManagement: React.FC<Props> = ({ paymentMethod, onClose }) => {
  const [cardholders, setCardholders] = useState<Cardholder[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const unsubscribe = listenToCardholders(paymentMethod.id, (data) => {
      setCardholders(data)
      setLoading(false)
    })
    return unsubscribe
  }, [paymentMethod.id])

  const handleAddCardholder = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!displayName.trim() || !accountHolder.trim()) {
      setError('Display name and account holder are required')
      return
    }

    try {
      setIsSubmitting(true)
      const newCardholder: Omit<Cardholder, 'id'> = {
        paymentMethodId: paymentMethod.id,
        displayName,
        accountHolder,
        accountNumber: accountNumber || undefined,
        phoneNumber: phoneNumber || undefined,
        balance: 0,
        status: cardholders.length === 0 ? 'active' : 'inactive' // First cardholder is active by default
      }

      await addCardholder(newCardholder)
      
      // Reset form
      setDisplayName('')
      setAccountHolder('')
      setAccountNumber('')
      setPhoneNumber('')
      setShowAddForm(false)
      alert('Cardholder added successfully!')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetActive = async (cardholderId: string) => {
    try {
      await setActiveCardholder(paymentMethod.id, cardholderId)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (cardholderId: string) => {
    if (confirm('Delete this cardholder?')) {
      try {
        await deleteCardholder(cardholderId)
      } catch (err) {
        setError((err as Error).message)
      }
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            <div className="h-32 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">👥 Cardholders - {paymentMethod.name}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 font-bold text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Add Cardholder Section */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 px-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-slate-400 hover:text-slate-700 font-medium transition"
            >
              + Add New Cardholder
            </button>
          ) : (
            <form onSubmit={handleAddCardholder} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-lg text-slate-900">Add New Cardholder</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Thierry, Sarah"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input-base w-full"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">Used for auto-selection and identification</p>
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    placeholder="Full account owner name"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="input-base w-full"
                    required
                  />
                </div>
              </div>

              {paymentMethod.type === 'bank' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Number</label>
                  <input
                    type="text"
                    placeholder="Bank account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="input-base w-full"
                  />
                </div>
              )}

              {paymentMethod.type === 'mobile' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="Mobile number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="input-base w-full"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary flex-1"
                >
                  {isSubmitting ? 'Adding...' : 'Add Cardholder'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn-secondary bg-slate-100 text-slate-700 border border-slate-300 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Cardholders List */}
          <div className="space-y-3">
            {cardholders.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No cardholders yet. Add one to get started.</p>
            ) : (
              cardholders.map(cardholder => (
                <div
                  key={cardholder.id}
                  className={`border-2 rounded-lg p-4 transition ${
                    cardholder.status === 'active'
                      ? 'border-green-300 bg-green-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-lg text-slate-900">{cardholder.displayName}</h4>
                        {cardholder.status === 'active' && (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            ✓ Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">Account: {cardholder.accountHolder}</p>
                      
                      {paymentMethod.type === 'bank' && cardholder.accountNumber && (
                        <p className="text-sm text-slate-600 font-mono">{cardholder.accountNumber}</p>
                      )}
                      
                      {paymentMethod.type === 'mobile' && cardholder.phoneNumber && (
                        <p className="text-sm text-slate-600 font-mono">{cardholder.phoneNumber}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {cardholder.status !== 'active' && (
                        <button
                          onClick={() => handleSetActive(cardholder.id)}
                          className="px-3 py-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition"
                        >
                          Make Active
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDelete(cardholder.id)}
                        className="px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-blue-900 font-semibold mb-2">💡 How it works:</p>
            <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
              <li>Only ONE cardholder can be active per payment method</li>
              <li>The active cardholder's details are shown to users in send-money</li>
              <li>Display names are used for auto-selection when sender name matches</li>
              <li>You can switch the active cardholder anytime</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CardholderManagement
