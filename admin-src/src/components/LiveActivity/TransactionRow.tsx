import React, { useState } from 'react'
import { Transaction } from '../../types/Transaction'
import StatusBadge from './StatusBadge'

interface Props {
  transaction: Transaction
  onStatusChange: (id: string, status: Transaction['status']) => Promise<void>
  onAnalyzeRisk: (transaction: Transaction) => Promise<void>   // 🆕
}

const TransactionRow: React.FC<Props> = ({ transaction, onStatusChange, onAnalyzeRisk }) => {
  const [updating, setUpdating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as Transaction['status']
    setUpdating(true)
    await onStatusChange(transaction.id, newStatus)
    setUpdating(false)
  }

  const handleAnalyzeRisk = async () => {
    setAnalyzing(true)
    await onAnalyzeRisk(transaction)
    setAnalyzing(false)
  }

  return (
    <tr className="border-b">
      <td className="px-4 py-2">{new Date(transaction.timestamp).toLocaleString()}</td>
      <td className="px-4 py-2">{transaction.amountSent} {transaction.currencySent}</td>
      <td className="px-4 py-2">{transaction.recipientName || '—'}</td>
      <td className="px-4 py-2"><StatusBadge status={transaction.status} /></td>
      <td className="px-4 py-2 space-x-2">
        <select
          value={transaction.status}
          onChange={handleStatusChange}
          disabled={updating}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="uploaded">Uploaded</option>
          <option value="completed">Completed</option>
        </select>
        <button
          onClick={handleAnalyzeRisk}
          disabled={analyzing}
          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
        >
          {analyzing ? 'Analyzing...' : 'Analyze Risk'}
        </button>
      </td>
    </tr>
  )
}

export default TransactionRow