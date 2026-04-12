import React, { useState } from 'react'
import { addPaymentMethod } from '../../services/paymentMethodService'

const CardForm: React.FC = () => {
  const [name, setName] = useState('')
  const [type, setType] = useState<'bank' | 'mobile' | 'cash'>('bank')
  const [currency, setCurrency] = useState('RUB')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    await addPaymentMethod({ name, type, currency, active: false, totalReceived: 0 })
    setName('')
    setType('bank')
    setCurrency('RUB')
  }

  return (
    <div>
      <h3 className="font-medium mb-2">Add new method</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Name (e.g. Sberbank)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-3 py-1"
          required
        />
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="border rounded px-3 py-1">
          <option value="bank">Bank</option>
          <option value="mobile">Mobile Money</option>
          <option value="cash">Cash</option>
        </select>
        <input
          type="text"
          placeholder="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          className="border rounded px-3 py-1 w-24"
        />
        <button type="submit" className="bg-green-600 text-white px-4 py-1 rounded">Add</button>
      </form>
    </div>
  )
}

export default CardForm