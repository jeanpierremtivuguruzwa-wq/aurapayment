import React from 'react'
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions'
import TransactionRow from './TransactionRow'
import { getFunctions, httpsCallable } from "firebase/functions";
import { Transaction } from '../../types/Transaction'

const LiveActivity: React.FC = () => {
  const { transactions, updateStatus } = useRealtimeTransactions()
  const functions = getFunctions()
  const askGemini = httpsCallable(functions, 'askGemini')

  const analyzeRisk = async (transaction: Transaction) => {
    // Use optional chaining and fallback values
    const provider = (transaction as any).provider || 'Not specified'
    const paymentMethod = (transaction as any).paymentMethod || 'Not specified'

    const prompt = `
      Analyze this payment transaction for fraud risk.
      - Amount: ${transaction.amountSent} ${transaction.currencySent}
      - Recipient: ${transaction.recipientName || 'Unknown'}
      - Provider: ${provider}
      - Payment method: ${paymentMethod}
      - Status: ${transaction.status}
      Return ONLY a single word: LOW, MEDIUM, or HIGH.
    `.trim();

    try {
      const result = await askGemini({ prompt })
      const riskLevel = (result.data as any).message.trim().toUpperCase()
      alert(`Risk level for transaction ${transaction.id}: ${riskLevel}`)
      // Optionally save risk level to Firestore
    } catch (error) {
      console.error("Risk analysis failed:", error)
      alert("Failed to analyze risk. See console for details.")
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-xl font-semibold mb-4">📋 Live Transactions</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Recipient</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                onStatusChange={updateStatus}
                onAnalyzeRisk={analyzeRisk}
              />
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default LiveActivity