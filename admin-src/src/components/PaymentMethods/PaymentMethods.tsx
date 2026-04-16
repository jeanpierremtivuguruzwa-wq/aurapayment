import React, { useState, useEffect } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { PaymentMethod } from '../../types/PaymentMethod'
import { Cardholder } from '../../types/Cardholder'
import { deletePaymentMethod, listenToPaymentMethodTotal, autoLinkOrCreateCardholder } from '../../services/paymentMethodService'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import CardForm from './CardForm'
import EditMethodForm from './EditMethodForm'
import { CreditCard, Landmark, Smartphone, Banknote, AlertTriangle, Link, Trash2 } from 'lucide-react'

type FilterTab = 'all' | 'bank' | 'mobile' | 'cash'

const ICONS: Record<string, React.ReactNode> = {
  bank: <Landmark className="w-5 h-5" />,
  mobile: <Smartphone className="w-5 h-5" />,
  cash: <Banknote className="w-5 h-5" />,
}

const PaymentMethods: React.FC = () => {
  const { data: methods, loading } = useFirestoreQuery<PaymentMethod>('paymentMethods', 'createdAt')
  const { data: cardholders } = useFirestoreQuery<Cardholder>('cardholders')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this payment method? This also removes its linked cardholders.')) return
    try {
      await deletePaymentMethod(id)
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  const handleToggleActive = async (method: PaymentMethod) => {
    try {
      await updateDoc(doc(db, 'paymentMethods', method.id), { active: !method.active })
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const counts = {
    all: methods.length,
    bank: methods.filter(m => m.type === 'bank').length,
    mobile: methods.filter(m => m.type === 'mobile').length,
    cash: methods.filter(m => m.type === 'cash').length,
  }

  const filtered = activeTab === 'all' ? methods : methods.filter(m => m.type === activeTab)

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'bank', label: 'Bank' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'cash', label: 'Cash' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Methods</h1>
          <p className="text-gray-500 text-sm mt-1">Manage account details for payments</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            These payment account details are shown to customers during checkout. Ensure all information is accurate and up-to-date. Changes apply immediately to new transactions.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          + Add Payment Method
        </button>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          counts[tab.key] > 0 || tab.key === 'all' ? (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[tab.key]}
              </span>
            </button>
          ) : null
        ))}
      </div>

      {/* ── Cards ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No {activeTab === 'all' ? '' : activeTab + ' '}methods yet</p>
          <p className="text-sm mt-1">Click <span className="text-indigo-600 font-medium">+ Add Payment Method</span> to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(method => (
            <MethodCard
              key={method.id}
              method={method}
              cardholder={cardholders.find(c => c.paymentMethodId === method.id) ?? null}
              onEdit={() => setEditingMethod(method)}
              onDelete={() => handleDelete(method.id)}
              onToggleActive={() => handleToggleActive(method)}
            />
          ))}
        </div>
      )}

      {/* ── Add Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Payment Method</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <div className="p-6">
              <CardForm onClose={() => setShowAddModal(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingMethod && (
        <EditMethodForm
          method={editingMethod}
          onClose={() => setEditingMethod(null)}
          onSaved={() => setEditingMethod(null)}
        />
      )}
    </div>
  )
}

// ─── Method Card ──────────────────────────────────────────────────────────────

function MethodCard({
  method,
  cardholder,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  method: PaymentMethod
  cardholder: Cardholder | null
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
  const icon = ICONS[method.type] ?? <CreditCard className="w-5 h-5" />
  const isBank = method.type === 'bank'
  const isMobile = method.type === 'mobile'

  // Live-listen to totalReceived so balance is always current
  const [liveReceived, setLiveReceived] = useState(method.totalReceived ?? 0)
  useEffect(() => {
    return listenToPaymentMethodTotal(method.id, setLiveReceived)
  }, [method.id])

  const liveBalance = Math.max(0, liveReceived - (cardholder?.totalWithdrawn ?? 0))

  const [linking, setLinking] = useState(false)

  const handleAutoLink = async () => {
    setLinking(true)
    try {
      const result = await autoLinkOrCreateCardholder(method as PaymentMethod & { id: string })
      alert(result === 'linked' ? '✓ Existing cardholder re-linked to this payment method.' : '✓ New cardholder created and linked.')
    } catch (err: any) {
      alert('Error: ' + err?.message)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
      method.active ? 'border-green-300' : 'border-gray-200'
    }`}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{method.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                {method.currency}
              </span>
              {method.active && (
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                  ✓ Active
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex-shrink-0 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          Edit
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-4" />

      {/* Account details */}
      <div className="px-4 py-3 space-y-3">
        {/* Account Number (bank) or Phone Number (mobile) */}
        {isBank && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account Number</p>
            <p className="text-sm font-mono text-gray-800 font-medium">
              {method.accountNumber || <span className="text-gray-300 italic font-sans text-xs">Not set</span>}
            </p>
          </div>
        )}
        {isMobile && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone Number</p>
            <p className="text-sm font-mono text-gray-800 font-medium">
              {method.phoneNumber || <span className="text-gray-300 italic font-sans text-xs">Not set</span>}
            </p>
          </div>
        )}
        {method.type === 'cash' && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Location / Details</p>
            <p className="text-sm text-gray-700">{method.description || <span className="text-gray-300 italic text-xs">Not set</span>}</p>
          </div>
        )}

        {/* Account Holder */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account Holder</p>
          <p className="text-sm text-gray-800 font-medium">
            {method.accountHolder || <span className="text-gray-300 italic text-xs font-normal">Not set</span>}
          </p>
        </div>

        {/* Total received + live balance */}
        {liveReceived > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Received</p>
              <p className="text-sm font-semibold text-green-600">
                {method.currency} {liveReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Current Balance</p>
              <p className="text-sm font-bold text-indigo-600">
                {method.currency} {liveBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Linked cardholder */}
        <div className={`rounded-lg px-3 py-2 border ${
          cardholder ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'
        }`}>
          {cardholder ? (
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                cardholder.status === 'active' ? 'text-indigo-600' : 'text-gray-500'
              }`}>Linked Cardholder</p>
              <p className="text-sm font-semibold text-gray-900">{cardholder.accountHolder}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  cardholder.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {cardholder.status === 'active' ? '✓ Active' : '○ Inactive'}
                </span>
                {(cardholder.totalWithdrawn ?? 0) > 0 && (
                  <span className="text-[10px] text-orange-600">
                    Withdrawn: {method.currency} {(cardholder.totalWithdrawn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> No cardholder linked</p>
              <button
                onClick={handleAutoLink}
                disabled={linking}
                className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
              >
                {linking ? 'Linking…' : <><Link className="w-3 h-3 inline mr-1" />Auto-Link</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50">
        <button
          onClick={onToggleActive}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
            method.active
              ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200'
              : 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
          }`}
        >
          {method.active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  )
}

export default PaymentMethods
