import React, { useState, useEffect } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { Cardholder } from '../../types/Cardholder'
import { PaymentMethod } from '../../types/PaymentMethod'
import {
  deleteCardholder,
  setActiveCardholder,
  addCardholder,
  updateCardholder,
  withdrawCardholder,
} from '../../services/cardholderService'
import { listenToPaymentMethodTotal } from '../../services/paymentMethodService'
import { doc, updateDoc, getDocs, collection } from 'firebase/firestore'
import { db } from '../../services/firebase'

// ─── Live Balance (subscribes directly to paymentMethods/{id}.totalReceived) ──

function LiveBalance({ paymentMethodId, totalWithdrawn }: { paymentMethodId: string; totalWithdrawn: number }) {
  const [received, setReceived] = useState<number | null>(null)

  useEffect(() => {
    if (!paymentMethodId) return
    const unsub = listenToPaymentMethodTotal(paymentMethodId, setReceived)
    return unsub
  }, [paymentMethodId])

  if (received === null) return <span className="text-gray-400 text-xs">…</span>

  const balance = Math.max(0, received - totalWithdrawn)
  return (
    <span className="font-bold text-green-600 text-sm">
      ₽{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

// ─── Add Cardholder Modal ─────────────────────────────────────────────────────

function AddCardholderModal({
  paymentMethods,
  onClose,
}: {
  paymentMethods: PaymentMethod[]
  onClose: () => void
}) {
  const [form, setForm] = useState({
    paymentMethodId: '',
    accountHolder: '',
    displayName: '',
    accountNumber: '',
    phoneNumber: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedMethod = paymentMethods.find(m => m.id === form.paymentMethodId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.paymentMethodId) { setError('Select a payment method'); return }
    if (!form.accountHolder.trim()) { setError('Full name is required'); return }
    if (!form.displayName.trim()) { setError('Display name is required'); return }
    setSaving(true)
    try {
      await addCardholder({
        paymentMethodId: form.paymentMethodId,
        accountHolder: form.accountHolder.trim(),
        displayName: form.displayName.trim(),
        accountNumber: form.accountNumber.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        balance: 0,
        status: 'inactive',
        transactionsCount: 0,
      } as Omit<Cardholder, 'id'>)
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add cardholder')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, opts?: { type?: string; placeholder?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={opts?.type ?? 'text'}
        value={form[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setError('') }}
        placeholder={opts?.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add Cardholder</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method <span className="text-red-500">*</span></label>
            <select
              value={form.paymentMethodId}
              onChange={e => { setForm(f => ({ ...f, paymentMethodId: e.target.value })); setError('') }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— Select payment method —</option>
              {paymentMethods.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.type} · {m.currency})</option>
              ))}
            </select>
          </div>

          {field('Full Name (Account Holder)', 'accountHolder', { placeholder: 'e.g. Jean-Pierre Martin', required: true })}
          {field('Display Name', 'displayName', { placeholder: 'e.g. Jean, Thierry — used in admin matching', required: true })}

          {/* Conditional account/phone based on method type */}
          {(!selectedMethod || selectedMethod.type === 'bank') &&
            field('Account Number', 'accountNumber', { placeholder: 'e.g. 4100 1234 5678 9012' })}
          {(!selectedMethod || selectedMethod.type === 'mobile') &&
            field('Phone Number', 'phoneNumber', { placeholder: 'e.g. +221 77 000 0000' })}
          {selectedMethod?.type === 'cash' && (
            <p className="text-xs text-gray-400 italic">Cash method — no account number needed.</p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Cardholder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Row ────────────────────────────────────────────────────────────────

interface EditState {
  accountHolder: string
  displayName: string
  accountNumber: string
  phoneNumber: string
  balance: number
  paymentMethodId: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CardholdersList: React.FC = () => {
  const { data: cardholders, loading } = useFirestoreQuery<Cardholder>('cardholders', 'createdAt')
  const { data: paymentMethods } = useFirestoreQuery<PaymentMethod>('paymentMethods')

  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<EditState>({ accountHolder: '', displayName: '', accountNumber: '', phoneNumber: '', balance: 0, paymentMethodId: '' })
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  // Withdraw modal state
  const [withdrawTarget, setWithdrawTarget] = useState<Cardholder | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawNote, setWithdrawNote] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawPmTotal, setWithdrawPmTotal] = useState(0)

  // Live-listen to paymentMethod.totalReceived while withdraw modal is open
  useEffect(() => {
    if (!withdrawTarget?.paymentMethodId) return
    return listenToPaymentMethodTotal(withdrawTarget.paymentMethodId, setWithdrawPmTotal)
  }, [withdrawTarget?.paymentMethodId])

  const getMethod = (id: string) => paymentMethods.find(m => m.id === id)
  const methodIcon = (type?: string) =>
    type === 'bank' ? '🏦' : type === 'mobile' ? '📱' : type === 'cash' ? '💵' : '💳'

  // ── Handlers ──────────────────────────────────────────────────────────────

  const startEdit = (ch: Cardholder) => {
    setEditId(ch.id)
    setEditData({
      accountHolder: ch.accountHolder ?? '',
      displayName: ch.displayName ?? '',
      accountNumber: ch.accountNumber ?? '',
      phoneNumber: ch.phoneNumber ?? '',
      balance: ch.balance ?? 0,
      paymentMethodId: ch.paymentMethodId ?? '',
    })
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      await updateCardholder(id, {
        accountHolder: editData.accountHolder,
        displayName: editData.displayName,
        accountNumber: editData.accountNumber || undefined,
        phoneNumber: editData.phoneNumber || undefined,
        balance: editData.balance,
        paymentMethodId: editData.paymentMethodId,
      })
      setEditId(null)
    } catch (err: any) {
      alert('Error: ' + err?.message)
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (ch: Cardholder) => {
    try {
      await setActiveCardholder(ch.paymentMethodId, ch.id)
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  const handleDeactivate = async (ch: Cardholder) => {
    try {
      await updateDoc(doc(db, 'cardholders', ch.id), { status: 'inactive' })
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cardholder? This cannot be undone.')) return
    try {
      await deleteCardholder(id)
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  const openWithdraw = (ch: Cardholder) => {
    setWithdrawTarget(ch)
    setWithdrawAmount('')
    setWithdrawNote('')
    setWithdrawRecipient('')
    setWithdrawError('')
  }

  const handleWithdraw = async () => {
    if (!withdrawTarget) return
    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) { setWithdrawError('Enter a valid amount'); return }
    const liveBalance = Math.max(0, withdrawPmTotal - (withdrawTarget.totalWithdrawn ?? 0))
    if (amount > liveBalance) { setWithdrawError(`Cannot withdraw more than current balance (${liveBalance.toLocaleString()})`); return }
    const composedNote = withdrawNote === 'Send to card'
      ? `Send to card – ${withdrawRecipient.trim()}`
      : withdrawNote
    setWithdrawing(true)
    try {
      await withdrawCardholder(withdrawTarget.id, amount, composedNote)
      setWithdrawTarget(null)
    } catch (err: any) {
      setWithdrawError(err?.message ?? 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  // Sync cardholder balances — matches by ID first, then by account/phone number as fallback
  // Also corrects paymentMethodId on the cardholder if it was stale/wrong
  const handleRecalculate = async () => {
    setRecalculating(true)
    try {
      const [pmSnap, ordersSnap, chSnap] = await Promise.all([
        getDocs(collection(db, 'paymentMethods')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'cardholders')),
      ])

      // Build lookup maps for payment methods
      const pmById: Record<string, { totalReceived: number }> = {}
      const pmByAcct: Record<string, { pmId: string; totalReceived: number }> = {}
      pmSnap.docs.forEach(d => {
        const data = d.data()
        const totalReceived = Number(data.totalReceived ?? 0)
        pmById[d.id] = { totalReceived }
        if (data.accountNumber?.trim()) pmByAcct[data.accountNumber.trim()] = { pmId: d.id, totalReceived }
        if (data.phoneNumber?.trim())   pmByAcct[data.phoneNumber.trim()]   = { pmId: d.id, totalReceived }
      })

      // Count completed orders per paymentMethod
      const txnCountMap: Record<string, number> = {}
      ordersSnap.docs.forEach(d => {
        const o = d.data()
        if (o.paymentMethod && o.status === 'completed') {
          txnCountMap[o.paymentMethod] = (txnCountMap[o.paymentMethod] ?? 0) + 1
        }
      })

      let fixed = 0
      for (const chDoc of chSnap.docs) {
        const ch = chDoc.data()

        // Try ID match first
        let correctPmId: string = ch.paymentMethodId ?? ''
        let totalReceived = pmById[correctPmId]?.totalReceived ?? 0

        // Fallback: match by account number or phone number
        if (totalReceived === 0) {
          const acctKey = ch.accountNumber?.trim()
          const phoneKey = ch.phoneNumber?.trim()
          const matched = (acctKey && pmByAcct[acctKey]) || (phoneKey && pmByAcct[phoneKey])
          if (matched) {
            correctPmId = matched.pmId
            totalReceived = matched.totalReceived
            fixed++
          }
        }

        const totalWithdrawn = Number(ch.totalWithdrawn ?? 0)
        const balance = Math.max(0, totalReceived - totalWithdrawn)
        const transactionsCount = txnCountMap[correctPmId] ?? Number(ch.transactionsCount ?? 0)

        await updateDoc(doc(db, 'cardholders', chDoc.id), {
          paymentMethodId: correctPmId,   // fix stale ID so LiveBalance works immediately
          totalReceived,
          balance,
          transactionsCount,
        })
      }

      alert(`✓ Balances synced.${fixed ? ` Fixed ${fixed} mislinked cardholder(s).` : ''}`)
    } catch (err: any) {
      alert('Error: ' + err?.message)
    } finally {
      setRecalculating(false)
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  // For the summary card, sum totalReceived across all payment methods that have
  // at least one cardholder, then subtract totalWithdrawn of active cardholders.
  const totalBalance = paymentMethods.reduce((s, pm) => {
    const linked = cardholders.find(c => c.paymentMethodId === pm.id && c.status === 'active')
    if (!linked) return s
    return s + Math.max(0, (pm.totalReceived ?? 0) - (linked.totalWithdrawn ?? 0))
  }, 0)
  const totalWithdrawn  = cardholders.reduce((s, c) => s + (c.totalWithdrawn ?? 0), 0)
  const totalTxns       = cardholders.reduce((s, c) => s + (c.transactionsCount ?? 0), 0)
  const activeCount     = cardholders.filter(c => c.status === 'active').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const inputCls = 'w-full px-2 py-1.5 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cardholder Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage payment accounts for receiving user funds</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {recalculating ? (
              <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full" />
            ) : '🔄'} Recalculate Balances
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            + Add Cardholder
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cards',      value: cardholders.length, color: 'from-slate-50 to-slate-100', text: 'text-slate-900', sub: 'text-slate-600' },
          { label: 'Active',            value: activeCount, color: 'from-green-50 to-green-100', text: 'text-green-900', sub: 'text-green-600' },
          { label: 'Current Balance',   value: `₽${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'from-blue-50 to-blue-100', text: 'text-blue-900', sub: 'text-blue-600' },
          { label: 'Total Withdrawn',   value: `₽${totalWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'from-orange-50 to-orange-100', text: 'text-orange-900', sub: 'text-orange-600' },
          { label: 'Transactions',      value: totalTxns, color: 'from-purple-50 to-purple-100', text: 'text-purple-900', sub: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-xl border border-gray-100 p-4`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${s.sub}`}>{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-900">All Cardholders</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage all cardholder accounts. Only active cardholders are visible to users.</p>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2.5 py-1 rounded-full">
            {cardholders.length} total
          </span>
        </div>

        {cardholders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💳</div>
            <p className="font-medium text-gray-500">No cardholders yet</p>
            <p className="text-sm mt-1">Click <span className="text-indigo-600 font-medium">+ Add Cardholder</span> to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Status', 'Full Name', 'Display Name', 'Payment Method', 'Account Number', 'Balance', 'Txns', 'Actions'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cardholders.map(ch => {
                  const method = getMethod(ch.paymentMethodId)
                  const isEditing = editId === ch.id
                  return (
                    <tr key={ch.id} className={`hover:bg-gray-50 transition-colors ${isEditing ? 'bg-indigo-50' : ''}`}>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          ch.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {ch.status === 'active' ? '✓ Active' : '○ Inactive'}
                        </span>
                      </td>

                      {/* Full Name */}
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <input className={inputCls} value={editData.accountHolder}
                            onChange={e => setEditData(d => ({ ...d, accountHolder: e.target.value }))} />
                        ) : (
                          <span className="font-medium text-gray-900">{ch.accountHolder || '—'}</span>
                        )}
                      </td>

                      {/* Display Name */}
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <input className={inputCls} value={editData.displayName}
                            onChange={e => setEditData(d => ({ ...d, displayName: e.target.value }))} />
                        ) : (
                          <span className="text-gray-700">{ch.displayName || '—'}</span>
                        )}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editData.paymentMethodId}
                            onChange={e => setEditData(d => ({ ...d, paymentMethodId: e.target.value }))}
                            className={inputCls}
                          >
                            <option value="">— select —</option>
                            {paymentMethods.map(m => (
                              <option key={m.id} value={m.id}>
                                {methodIcon(m.type)} {m.name} · {m.currency}
                                {m.totalReceived ? ` (₽${Number(m.totalReceived).toLocaleString()})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-gray-700">
                            <span>{methodIcon(method?.type)}</span>
                            <span>{method?.name ?? <span className="text-red-500 text-xs">⚠️ Unlinked</span>}</span>
                            {method?.currency && (
                              <span className="text-xs text-gray-400">· {method.currency}</span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Account Number */}
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input className={inputCls} placeholder="Account #" value={editData.accountNumber}
                              onChange={e => setEditData(d => ({ ...d, accountNumber: e.target.value }))} />
                            <input className={inputCls} placeholder="Phone #" value={editData.phoneNumber}
                              onChange={e => setEditData(d => ({ ...d, phoneNumber: e.target.value }))} />
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-gray-600">
                            {ch.accountNumber || ch.phoneNumber || '—'}
                          </span>
                        )}
                      </td>

                      {/* Balance — live from paymentMethods.totalReceived for active, dash for inactive */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isEditing ? (
                          <input type="number" step="0.01" className={inputCls} value={editData.balance}
                            onChange={e => setEditData(d => ({ ...d, balance: parseFloat(e.target.value) || 0 }))} />
                        ) : ch.status === 'active' ? (
                          <LiveBalance
                            paymentMethodId={ch.paymentMethodId}
                            totalWithdrawn={ch.totalWithdrawn ?? 0}
                          />
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>

                      {/* Txns */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {ch.transactionsCount ?? 0}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(ch.id)} disabled={saving}
                                className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                                {saving ? '…' : '✓ Save'}
                              </button>
                              <button onClick={() => setEditId(null)} disabled={saving}
                                className="px-2.5 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(ch)}
                                className="px-2.5 py-1.5 text-xs bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 font-medium"
                                title="Edit">
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => openWithdraw(ch)}
                                className="px-2.5 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium"
                                title="Withdraw money"
                              >
                                💸 Withdraw
                              </button>
                              {ch.status === 'active' ? (
                                <button onClick={() => handleDeactivate(ch)}
                                  className="px-2.5 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium"
                                  title="Set inactive">
                                  ⏸ Deactivate
                                </button>
                              ) : (
                                <button onClick={() => handleActivate(ch)}
                                  className="px-2.5 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                                  title="Set active">
                                  ▶ Activate
                                </button>
                              )}
                              <button onClick={() => handleDelete(ch.id)}
                                className="px-2.5 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium"
                                title="Delete">
                                🗑
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddCardholderModal
          paymentMethods={paymentMethods}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── Withdraw Modal ── */}
      {withdrawTarget && (() => {
        const wLiveBalance = Math.max(0, withdrawPmTotal - (withdrawTarget.totalWithdrawn ?? 0))
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">💸 Withdraw Money</h2>
              <button onClick={() => setWithdrawTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Cardholder info */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-orange-900">{withdrawTarget.accountHolder}</p>
                <p className="text-xs text-orange-700 mt-0.5">Current balance: <strong>₽{wLiveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                {(withdrawTarget.totalWithdrawn ?? 0) > 0 && (
                  <p className="text-xs text-orange-600 mt-0.5">Total withdrawn to date: ₽{(withdrawTarget.totalWithdrawn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Withdrawal Amount <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₽</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={wLiveBalance}
                    value={withdrawAmount}
                    onChange={e => { setWithdrawAmount(e.target.value); setWithdrawError('') }}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    autoFocus
                  />
                </div>
                {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Balance after withdrawal: <strong>₽{(wLiveBalance - parseFloat(withdrawAmount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>

              {/* Withdrawal type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Withdrawal Type <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {['ATM', 'Send to card'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { setWithdrawNote(opt); setWithdrawRecipient('') }}
                      className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        withdrawNote === opt
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400 hover:text-orange-600'
                      }`}
                    >
                      {opt === 'ATM' ? '🏧 ATM' : '💳 Send to card'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient name — only when Send to card is chosen */}
              {withdrawNote === 'Send to card' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={withdrawRecipient}
                    onChange={e => setWithdrawRecipient(e.target.value)}
                    placeholder="Full name of the person receiving"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    autoFocus
                  />
                </div>
              )}

              {withdrawError && <p className="text-xs text-red-600">{withdrawError}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setWithdrawTarget(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || !withdrawNote || (withdrawNote === 'Send to card' && !withdrawRecipient.trim())}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                >
                  {withdrawing ? 'Processing…' : '💸 Confirm Withdrawal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )
      })()}
    </div>
  )
}

export default CardholdersList
