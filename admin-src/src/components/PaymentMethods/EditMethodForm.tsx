import React, { useState } from 'react'
import { PaymentMethod } from '../../types/PaymentMethod'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'

interface Props {
  method: PaymentMethod
  onClose: () => void
  onSaved: () => void
}

const EditMethodForm: React.FC<Props> = ({ method, onClose, onSaved }) => {
  const [formData, setFormData] = useState<PaymentMethod>(method)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: keyof PaymentMethod, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      setIsLoading(true)
      const methodRef = doc(db, 'paymentMethods', method.id)
      const { id, totalReceived, createdAt, ...updateData } = formData
      
      // Remove undefined fields - Firestore doesn't allow undefined values
      const cleanedData = Object.fromEntries(
        Object.entries(updateData).filter(([_, value]) => value !== undefined)
      )

      await updateDoc(methodRef, cleanedData)
      alert('Payment method updated successfully!')
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span className="text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></span> Edit Payment Method</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 font-bold text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-slate-900">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Method Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="input-base w-full"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="input-base w-full"
                  disabled
                >
                  <option value="bank">Bank Transfer</option>
                  <option value="mobile">Mobile Money</option>
                  <option value="cash">Cash Pickup</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">Type cannot be changed</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Currency</label>
                <input
                  type="text"
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value.toUpperCase())}
                  maxLength={3}
                  className="input-base w-full"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Processing Time</label>
                <input
                  type="text"
                  placeholder="e.g. 1-2 hours"
                  value={formData.processingTime || ''}
                  onChange={(e) => handleChange('processingTime', e.target.value)}
                  className="input-base w-full"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Additional details about this payment method"
                className="input-base w-full h-20 resize-none"
              />
            </div>
          </div>

          {/* Bank-specific fields */}
          {formData.type === 'bank' && (
            <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-lg text-blue-900">Bank Account Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    placeholder="Full name of account owner"
                    value={formData.accountHolder || ''}
                    onChange={(e) => handleChange('accountHolder', e.target.value)}
                    className="input-base w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Number</label>
                  <input
                    type="text"
                    placeholder="Bank account number"
                    value={formData.accountNumber || ''}
                    onChange={(e) => handleChange('accountNumber', e.target.value)}
                    className="input-base w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mobile Money-specific fields */}
          {formData.type === 'mobile' && (
            <div className="space-y-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-lg text-purple-900">Mobile Money Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    placeholder="Full name of account owner"
                    value={formData.accountHolder || ''}
                    onChange={(e) => handleChange('accountHolder', e.target.value)}
                    className="input-base w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+1234567890 or local format"
                    value={formData.phoneNumber || ''}
                    onChange={(e) => handleChange('phoneNumber', e.target.value)}
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
              {isLoading ? '⏳ Saving...' : '✓ Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditMethodForm
