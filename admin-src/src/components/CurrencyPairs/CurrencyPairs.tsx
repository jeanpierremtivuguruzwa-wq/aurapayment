import React from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { CurrencyPair } from '../../types/CurrencyPair'
import { updateCurrencyPair } from '../../services/currencyService'
import PairForm from './PairForm'
import UrgencyToggle from './UrgencyToggle'

const CurrencyPairs: React.FC = () => {
  const { data: pairs, loading } = useFirestoreQuery<CurrencyPair>('currencyPairs')

  const handleRateUpdate = async (id: string, newRate: number) => {
    await updateCurrencyPair(id, { rate: newRate })
  }

  const handleUrgencyToggle = async (id: string, urgent: boolean) => {
    await updateCurrencyPair(id, { urgent })
  }

  if (loading) return <div className="text-center py-8">Loading currency pairs...</div>

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-xl font-semibold mb-4">💱 Currency Pairs</h2>
      <div className="space-y-3 mb-6">
        {pairs.map(pair => (
          <div key={pair.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">{pair.from}/{pair.to}</div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.0001"
                defaultValue={pair.rate}
                onBlur={(e) => handleRateUpdate(pair.id, parseFloat(e.target.value))}
                className="w-28 px-2 py-1 border rounded"
              />
              <UrgencyToggle id={pair.id} urgent={pair.urgent} onToggle={handleUrgencyToggle} />
            </div>
          </div>
        ))}
      </div>
      <PairForm />
    </div>
  )
}

export default CurrencyPairs