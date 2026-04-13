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
    <div className="card-base p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold">📋 Live Transactions</h2>
        <span className="text-sm font-medium text-slate-500">{transactions.length} transactions</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Recipient</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                onStatusChange={updateStatus}
                onAnalyzeRisk={analyzeRisk}
              />
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-slate-500 font-medium">✨ No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default LiveActivity