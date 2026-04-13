import React, { useState } from 'react'
import { addPaymentMethod } from '../../services/paymentMethodService'
import { serverTimestamp } from 'firebase/firestore'

interface Preset {
  key: string
  label: string
  name: string
  type: 'bank' | 'mobile' | 'cash'
  currency: string
}

const PRESETS: Preset[] = [
  { key: 'custom', label: '\u2014 Custom (manual) \u2014', name: '', type: 'bank', currency: '' },
  // Bank \u2013 Russia
  { key: 'sberbank', label: 'Sberbank', name: 'Sberbank', type: 'bank', currency: 'RUB' },
  { key: 'tinkoff', label: 'Tinkoff', name: 'Tinkoff', type: 'bank', currency: 'RUB' },
  { key: 'alfa', label: 'Alfa-Bank', name: 'Alfa-Bank', type: 'bank', currency: 'RUB' },
  { key: 'vtb', label: 'VTB', name: 'VTB', type: 'bank', currency: 'RUB' },
  { key: 'raiffeisen', label: 'Raiffeisenbank', name: 'Raiffeisenbank', type: 'bank', currency: 'RUB' },
  // MTN Mobile Money
  { key: 'mtn_bj', label: 'MTN Mobile Money (B\u00e9nin)', name: 'MTN Mobile Money B\u00e9nin', type: 'mobile', currency: 'XOF' },
  { key: 'mtn_gh', label: 'MTN Mobile Money (Ghana)', name: 'MTN Mobile Money Ghana', type: 'mobile', currency: 'GHS' },
  { key: 'mtn_ng', label: 'MTN Mobile Money (Nigeria)', name: 'MTN Mobile Money Nigeria', type: 'mobile', currency: 'NGN' },
  { key: 'mtn_ci', label: "MTN Mobile Money (C\u00f4te d'Ivoire)", name: "MTN Mobile Money C\u00f4te d'Ivoire", type: 'mobile', currency: 'XOF' },
  { key: 'mtn_cm', label: 'MTN Mobile Money (Cameroon)', name: 'MTN Mobile Money Cameroon', type: 'mobile', currency: 'XAF' },
  { key: 'mtn_rw', label: 'MTN Mobile Money (Rwanda)', name: 'MTN Mobile Money Rwanda', type: 'mobile', currency: 'RWF' },
  { key: 'mtn_ug', label: 'MTN Mobile Money (Uganda)', name: 'MTN Mobile Money Uganda', type: 'mobile', currency: 'UGX' },
  { key: 'mtn_zm', label: 'MTN Mobile Money (Zambia)', name: 'MTN Mobile Money Zambia', type: 'mobile', currency: 'ZMW' },
  // Orange Money
  { key: 'orange_sn', label: 'Orange Money (S\u00e9n\u00e9gal)', name: 'Orange Money S\u00e9n\u00e9gal', type: 'mobile', currency: 'XOF' },
  { key: 'orange_ml', label: 'Orange Money (Mali)', name: 'Orange Money Mali', type: 'mobile', currency: 'XOF' },
  { key: 'orange_ci', label: "Orange Money (C\u00f4te d'Ivoire)", name: "Orange Money C\u00f4te d'Ivoire", type: 'mobile', currency: 'XOF' },
  { key: 'orange_cm', label: 'Orange Money (Cameroon)', name: 'Orange Money Cameroon', type: 'mobile', currency: 'XAF' },
  { key: 'orange_bf', label: 'Orange Money (Burkina Faso)', name: 'Orange Money Burkina Faso', type: 'mobile', currency: 'XOF' },
  // Airtel Money
  { key: 'airtel_tz', label: 'Airtel Money (Tanzania)', name: 'Airtel Money Tanzania', type: 'mobile', currency: 'TZS' },
  { key: 'airtel_ke', label: 'Airtel Money (Kenya)', name: 'Airtel Money Kenya', type: 'mobile', currency: 'KES' },
  { key: 'airtel_rw', label: 'Airtel Money (Rwanda)', name: 'Airtel Money Rwanda', type: 'mobile', currency: 'RWF' },
  { key: 'airtel_ug', label: 'Airtel Money (Uganda)', name: 'Airtel Money Uganda', type: 'mobile', currency: 'UGX' },
  // Wave
  { key: 'wave_sn', label: 'Wave (S\u00e9n\u00e9gal)', name: 'Wave S\u00e9n\u00e9gal', type: 'mobile', currency: 'XOF' },
  { key: 'wave_ci', label: "Wave (C\u00f4te d'Ivoire)", name: "Wave C\u00f4te d'Ivoire", type: 'mobile', currency: 'XOF' },
  // Moov Money
  { key: 'moov_bj', label: 'Moov Money (B\u00e9nin)', name: 'Moov Money B\u00e9nin', type: 'mobile', currency: 'XOF' },
  { key: 'moov_tg', label: 'Moov Money (Togo)', name: 'Moov Money Togo', type: 'mobile', currency: 'XOF' },
  { key: 'moov_ci', label: "Moov Money (C\u00f4te d'Ivoire)", name: "Moov Money C\u00f4te d'Ivoire", type: 'mobile', currency: 'XOF' },
  // M-Pesa
  { key: 'mpesa_ke', label: 'M-Pesa (Kenya)', name: 'M-Pesa Kenya', type: 'mobile', currency: 'KES' },
  { key: 'mpesa_tz', label: 'M-Pesa (Tanzania)', name: 'M-Pesa Tanzania', type: 'mobile', currency: 'TZS' },
  // Others
  { key: 'yoomoney', label: 'YooMoney', name: 'YooMoney', type: 'mobile', currency: 'RUB' },
  { key: 'cash', label: 'Cash Pickup', name: 'Cash Pickup', type: 'cash', currency: '' },
]

interface CardFormProps {
  onClose?: () => void
}

const CardForm: React.FC<CardFormProps> = ({ onClose }) => {
  const [presetKey, setPresetKey] = useState('custom')
  const [name, setName] = useState('')
  const [type, setType] = useState<'bank' | 'mobile' | 'cash'>('bank')
  const [currency, setCurrency] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [accountHolder, setAccountHolder] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [description, setDescription] = useState('')
  const [processingTime, setProcessingTime] = useState('')

  const handlePresetChange = (key: string) => {
    setPresetKey(key)
    const preset = PRESETS.find(p => p.key === key)
    if (preset && key !== 'custom') {
      setName(preset.name)
      setType(preset.type)
      setCurrency(preset.currency)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('Please enter a method name')
      return
    }
    if (!currency.trim()) {
      alert('Please enter a currency')
      return
    }

    try {
      setIsLoading(true)
      const methodData: any = {
        name,
        type,
        currency: currency.toUpperCase(),
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

      await addPaymentMethod(methodData)

      setPresetKey('custom')
      setName('')
      setType('bank')
      setCurrency('')
      setAccountHolder('')
      setAccountNumber('')
      setPhoneNumber('')
      setDescription('')
      setProcessingTime('')

      alert('Payment method added successfully!')
      onClose?.()
    } catch (err) {
      alert('Error adding payment method: ' + (err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Network Preset */}
        <div>
          <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Select Network / Provider</label>
          <select
            value={presetKey}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="input-base w-full"
          >
            {PRESETS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          {presetKey !== 'custom' && (
            <p className="text-xs text-slate-500 mt-1">Fields auto-filled \u2014 edit below as needed</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Method Name</label>
            <input
              type="text"
              placeholder="e.g. Sberbank, MTN Mobile Money"
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
              <option value="bank">\ud83c\udfe6 Bank Transfer</option>
              <option value="mobile">\ud83d\udcf1 Mobile Money</option>
              <option value="cash">\ud83d\udcb5 Cash Pickup</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Currency</label>
            <input
              type="text"
              placeholder="XOF, XAF, RUB, GHS..."
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
              placeholder="e.g. Instant, 1-2 hours"
              value={processingTime}
              onChange={(e) => setProcessingTime(e.target.value)}
              className="input-base w-full"
            />
          </div>
        </div>

        {/* Bank fields */}
        {type === 'bank' && (
          <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900">\ud83c\udfe6 Bank Account Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder</label>
                <input
                  type="text"
                  placeholder="Full name on account"
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

        {/* Mobile Money fields */}
        {type === 'mobile' && (
          <div className="space-y-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900">\ud83d\udcf1 Mobile Money Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Account Holder</label>
                <input
                  type="text"
                  placeholder="Full name on account"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="input-base w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+229 97 000 000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="input-base w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Cash fields */}
        {type === 'cash' && (
          <div className="space-y-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900">\ud83d\udcb5 Cash Pickup Details</h3>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Location / Instructions</label>
              <textarea
                placeholder="Pickup location or instructions"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-base w-full h-20 resize-none"
              />
            </div>
          </div>
        )}

        {type !== 'cash' && (
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">Description (optional)</label>
            <textarea
              placeholder="Additional notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-base w-full h-16 resize-none"
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary flex-1"
          >
            {isLoading ? 'Adding...' : 'Add Payment Method'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="btn-secondary px-6">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default CardForm
