import React, { useState } from 'react'
import { addPaymentMethod } from '../../services/paymentMethodService'
import { serverTimestamp } from 'firebase/firestore'

const CardForm: React.FC = () => {
  const [name, setName] = useState('')
  const [type, setType] = useState<'bank' | 'mobile' | 'cash'>('bank')
  const [currency, setCurrency] = useState('USD')
  const [isLoading, setIsLoading] = useState(false)

  // Bank fields
  const [accountHolder, setAccountHolder] = useState('')
  const [accountNumber, setAccountNumber] = useState('')

  // Mobile fields
  const [phoneNumber, setPhoneNumber] = useState('')

  // Common fields
  const [description, setDescription] = useState('')
  const [processingTime, setProcessingTime] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !accountHolder.trim()) {
      alert('Please enter method name and account holder name')
      return
    }

    try {
      setIsLoading(true)
      const methodData: any = {
        name,
        type,
        currency,
        active: false,
        totalReceived: 0,
        description: description || undefined,
        processingTime: processingTime || undefined,
        createdAt: serverTimestamp()
      }

      if (type === 'bank') {
        methodData.accountHolder = accountHolder || undefined
        methodData.accountNumber = accountNumber || undefined
      }

      if (type === 'mobile') {
        methodData.accountHolder = accountHolder || undefined
        methodData.phoneNumber = phoneNumber || undefined
      }

      // Add payment method only - cardholder will be auto-created by the system
      await addPaymentMethod(methodData)
      
      // Reset form
      setName('')
      setType('bank')
      setCurrency('USD')
      setAccountHolder('')
      setAccountNumber('')
      setPhoneNumber('')
      setDescription('')
      setProcessingTime('')
      
      alert('Payment method and cardholder added successfully!')
    } catch (err) {
      alert('Error adding payment method: ' + (err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card-base p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold">➕ Add New Payment Method</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg text-slate-900">📋 Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Method Name</label>
              <input
                type="text"
                placeholder="e.g. Sberbank, MTN Mobile Money, M-Pesa"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-base w-full"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="input-base w-full"
              >
                <option value="bank">🏦 Bank Transfer</option>
                <option value="mobile">📱 Mobile Money</option>
                <option value="cash">💵 Cash Pickup</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Currency</label>
              <input
                type="text"
                placeholder="USD, EUR, XOF, XAF, RUB"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="input-base w-full"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Processing Time</label>
              <input
                type="text"
                placeholder="e.g. 1-2 hours, Same day"
                value={processingTime}
                onChange={(e) => setProcessingTime(e.target.value)}
                className="input-base w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Description</label>
            <textarea
              placeholder="Additional details about this payment method"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-base w-full h-16 resize-none"
            />
          </div>
        </div>

        {/* Bank-specific fields */}
        {type === 'bank' && (
          <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-lg text-blue-900">🏦 Bank Account Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Full name of account owner"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="input-base w-full"
                />
              </div>
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

            </div>
          </div>
        )}

        {/* Mobile Money-specific fields */}
        {type === 'mobile' && (
          <div className="space-y-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-semibold text-lg text-purple-900">📱 Mobile Money Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Full name of account owner"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="input-base w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+1234567890 or local format"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="input-base w-full"
                />
              </div>
            </div>
          </div>
        )}



        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary flex items-center gap-2"
          >
            {isLoading ? '⏳ Adding...' : '✓ Add Payment Method'}
          </button>
          <button
            type="button"
            onClick={() => {
              setName('')
              setType('bank')
              setCurrency('USD')
              setAccountHolder('')
              setAccountNumber('')
              setPhoneNumber('')
              setDescription('')
              setProcessingTime('')
            }}
            className="btn-secondary bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200"
          >
            Clear Form
          </button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <p className="font-semibold mb-2">💡 Tips:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Add all payment methods that your business accepts</li>
          <li>You can edit or update methods daily - use the Edit button</li>
          <li>Set one as "Active" for it to be available to users in send-money</li>
          <li>You can manage up to 20+ payment methods</li>
        </ul>
      </div>
    </div>
  )
}

export default CardForm
