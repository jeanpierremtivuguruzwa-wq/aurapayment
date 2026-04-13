import React, { useState } from 'react'
import { useCurrencyAssignments, EnrichedCardholder } from '../../hooks/useCurrencyAssignments'

// ─── Cardholder row ──────────────────────────────────────────────────────────

function CardholderRow({
  ch,
  isDefault,
  onSetDefault,
  onRemove,
}: {
  ch: EnrichedCardholder
  isDefault: boolean
  onSetDefault: () => void
  onRemove: () => void
}) {
  const initials = ch.displayName
    ? ch.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
      isDefault ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white hover:bg-gray-50'
    }`}>
      {/* Avatar */}
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
        {initials}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{ch.displayName}</span>
          {isDefault && (
            <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 border border-yellow-300 px-1.5 py-0.5 rounded-full">
              ★ Default
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
            ch.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {ch.status}
          </span>
        </div>
        <div className="text-xs text-gray-400 mt-0.5 truncate">
          {ch.method ? `${ch.method.name} · ${ch.method.type}` : 'No method linked'}
          {(ch.accountNumber || ch.phoneNumber) && ` · ${ch.accountNumber || ch.phoneNumber}`}
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!isDefault && (
          <button
            onClick={onSetDefault}
            title="Set as default"
            className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
          >
            Set Default
          </button>
        )}
        <button
          onClick={onRemove}
          title="Remove cardholder"
          className="text-xs px-2 py-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors border border-transparent hover:border-red-200"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Add Cardholder Panel ────────────────────────────────────────────────────

function AddCardholderPanel({
  available,
  onAdd,
  onCancel,
}: {
  available: EnrichedCardholder[]
  onAdd: (id: string) => Promise<void>
  onCancel: () => void
}) {
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    if (!selected) return
    setLoading(true)
    try { await onAdd(selected) } finally { setLoading(false) }
    onCancel()
  }

  if (available.length === 0) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-dashed border-gray-300 text-xs text-gray-400 text-center">
        All cardholders are already assigned, or no cardholders exist.
        <br />Create cardholders in the <span className="font-medium text-indigo-600">Cardholders</span> section.
      </div>
    )
  }

  return (
    <div className="mt-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200 space-y-2">
      <p className="text-xs font-medium text-indigo-700">Select a cardholder to add:</p>
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="w-full text-sm px-3 py-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        autoFocus
      >
        <option value="">— Choose cardholder —</option>
        {available.map(ch => (
          <option key={ch.id} value={ch.id}>
            {ch.displayName}
            {ch.method ? ` (${ch.method.name})` : ''}
            {ch.status === 'inactive' ? ' [inactive]' : ''}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-white"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!selected || loading}
          className="flex-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// ─── Role Column ─────────────────────────────────────────────────────────────

function RoleColumn({
  label,
  description,
  icon,
  color,
  assignedIds,
  defaultId,
  allCardholders,
  getCardholder,
  onSetDefault,
  onAdd,
  onRemove,
}: {
  role: 'receive' | 'payout'
  label: string
  description: string
  icon: string
  color: string
  assignedIds: string[]
  defaultId: string | null
  allCardholders: EnrichedCardholder[]
  getCardholder: (id: string) => EnrichedCardholder | undefined
  onSetDefault: (id: string) => void
  onAdd: (id: string) => Promise<void>
  onRemove: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)

  // Cardholders not yet in this role's list
  const available = allCardholders.filter(ch => !assignedIds.includes(ch.id))

  return (
    <div className="p-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center text-xs font-bold`}>
            {icon}
          </div>
          <h4 className="text-sm font-semibold text-gray-700">{label}</h4>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
        >
          + Add Cardholder
        </button>
      </div>

      <p className="text-xs text-gray-400">{description}</p>

      {/* Add panel */}
      {showAdd && (
        <AddCardholderPanel
          available={available}
          onAdd={async (id) => { await onAdd(id); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Assigned list */}
      {assignedIds.length === 0 ? (
        <div className="py-4 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">
          No cardholders assigned yet.
          <br />Click <span className="font-medium text-indigo-600">+ Add Cardholder</span> to assign one.
        </div>
      ) : (
        <div className="space-y-2">
          {assignedIds.map(id => {
            const ch = getCardholder(id)
            if (!ch) return (
              <div key={id} className="p-2 text-xs text-gray-400 bg-gray-50 rounded-lg border border-dashed">
                Cardholder {id.slice(0, 8)}… not found
                <button onClick={() => onRemove(id)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
              </div>
            )
            return (
              <CardholderRow
                key={id}
                ch={ch}
                isDefault={id === defaultId}
                onSetDefault={() => onSetDefault(id)}
                onRemove={() => onRemove(id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Currency Block ──────────────────────────────────────────────────────────

function CurrencyBlock({
  currency,
  assignment,
  allCardholders,
  getCardholder,
  onSetDefault,
  onAdd,
  onRemove,
}: {
  currency: string
  assignment: { receivesIds: string[]; payoutsIds: string[]; receiveDefaultId: string | null; payoutDefaultId: string | null }
  allCardholders: EnrichedCardholder[]
  getCardholder: (id: string) => EnrichedCardholder | undefined
  onSetDefault: (role: 'receive' | 'payout', id: string) => void
  onAdd: (role: 'receive' | 'payout', id: string) => Promise<void>
  onRemove: (role: 'receive' | 'payout', id: string) => void
}) {
  const totalAssigned = new Set([...assignment.receivesIds, ...assignment.payoutsIds]).size

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
          {currency.slice(0, 3)}
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-base">{currency}</h3>
          <p className="text-xs text-gray-400">{totalAssigned} cardholder{totalAssigned !== 1 ? 's' : ''} assigned</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <RoleColumn
          role="receive"
          label="Receives Payments"
          description={`Cardholders that receive incoming ${currency} from users.`}
          icon="↓"
          color="bg-green-100 text-green-600"
          assignedIds={assignment.receivesIds}
          defaultId={assignment.receiveDefaultId}
          allCardholders={allCardholders}
          getCardholder={getCardholder}
          onSetDefault={(id) => onSetDefault('receive', id)}
          onAdd={(id) => onAdd('receive', id)}
          onRemove={(id) => onRemove('receive', id)}
        />
        <RoleColumn
          role="payout"
          label="Sends Payouts"
          description={`Cardholders that send ${currency} to recipients.`}
          icon="↑"
          color="bg-blue-100 text-blue-600"
          assignedIds={assignment.payoutsIds}
          defaultId={assignment.payoutDefaultId}
          allCardholders={allCardholders}
          getCardholder={getCardholder}
          onSetDefault={(id) => onSetDefault('payout', id)}
          onAdd={(id) => onAdd('payout', id)}
          onRemove={(id) => onRemove('payout', id)}
        />
      </div>
    </div>
  )
}

// ─── Add Currency Modal ──────────────────────────────────────────────────────

function AddCurrencyModal({ onClose, onAdd }: { onClose: () => void; onAdd: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setError('Currency code is required'); return }
    if (!/^[A-Z]{2,6}$/.test(trimmed)) { setError('Enter a valid 2–6 letter code (e.g. RUB, XOF, EUR)'); return }
    setLoading(true)
    try { await onAdd(trimmed); onClose() }
    catch (err: any) { setError(err?.message ?? 'Failed to add currency') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add Currency</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency Code</label>
            <input
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
              placeholder="e.g. RUB, XOF, EUR"
              maxLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <p className="text-xs text-gray-400">
            After adding, assign cardholders to each role using the <em>+ Add Cardholder</em> button.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add Currency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CurrencyCardholderAssignments() {
  const {
    currencies, allCardholders, getCardholder, getAssignment,
    loading, setDefault, addCurrency, addCardholderToRole, removeCardholderFromRole,
  } = useCurrencyAssignments()

  const [showAddModal, setShowAddModal] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Currency Assignments</h1>
          <p className="text-gray-500 text-sm mt-1">
            Assign cardholders to each currency role and set a default for auto-selection on new orders.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          + Add Currency
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>How it works:</strong> Add any cardholder from your Cardholders list to each currency's{' '}
        <em>Receives Payments</em> or <em>Sends Payouts</em> role. Mark one as{' '}
        <strong>★ Default</strong> — it will be auto-selected when a new order is created for that currency.
      </div>

      {/* Currency blocks */}
      {currencies.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🏦</div>
          <p className="text-lg font-medium text-gray-500">No currencies yet</p>
          <p className="text-sm mt-1">Click <span className="font-medium text-indigo-600">+ Add Currency</span> to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {currencies.map(currency => (
            <CurrencyBlock
              key={currency}
              currency={currency}
              assignment={getAssignment(currency)}
              allCardholders={allCardholders}
              getCardholder={getCardholder}
              onSetDefault={(role, id) => setDefault(currency, role, id)}
              onAdd={(role, id) => addCardholderToRole(currency, role, id)}
              onRemove={(role, id) => removeCardholderFromRole(currency, role, id)}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddCurrencyModal onClose={() => setShowAddModal(false)} onAdd={addCurrency} />
      )}
    </div>
  )
}
