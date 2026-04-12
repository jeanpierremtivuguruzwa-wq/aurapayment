import React, { useState } from 'react'
import { addCurrencyPair } from '../../services/currencyService'

const PairForm: React.FC = () => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rate, setRate] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!from || !to || !rate) return
    await addCurrencyPair({ from: from.toUpperCase(), to: to.toUpperCase(), rate: parseFloat(rate), urgent: false })
    setFrom('')
    setTo('')
    setRate('')
  }

  return (
    <div>
      <h3 className="font-medium mb-2">Add new pair</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="From (e.g. RUB)"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-3 py-1 w-28"
          required
        />
        <input
          type="text"
          placeholder="To (e.g. XOF)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border rounded px-3 py-1 w-28"
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Rate"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="border rounded px-3 py-1 w-28"
          required
        />
        <button type="submit" className="bg-green-600 text-white px-4 py-1 rounded">Add</button>
      </form>
    </div>
  )
}

export default PairForm