import React, { useState } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'

interface Recipient {
  id: string
  email: string
  active: boolean
  createdAt?: any
}

const NotificationRecipients: React.FC = () => {
  const { data: recipients, loading } = useFirestoreQuery<Recipient>('notificationRecipients', 'createdAt')
  const [emailInput, setEmailInput] = useState('')
  const [adding, setAdding] = useState(false)

  const totalRecipients = recipients.length
  const activeCount = recipients.filter(r => r.active).length
  const pausedCount = recipients.filter(r => !r.active).length

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleAdd = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) {
      alert('Please enter a valid email address.')
      return
    }
    if (recipients.some(r => r.email === email)) {
      alert('This email is already in the list.')
      return
    }
    try {
      setAdding(true)
      await addDoc(collection(db, 'notificationRecipients'), {
        email,
        active: true,
        createdAt: serverTimestamp(),
      })
      setEmailInput('')
    } catch (err) {
      alert('Error adding recipient: ' + (err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  const handleToggle = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'notificationRecipients', id), { active: !current })
  }

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from notification recipients?`)) return
    await deleteDoc(doc(db, 'notificationRecipients', id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-base p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔔 Notification Recipients</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage who receives email notifications for orders, status changes, and payment proofs.
            </p>
          </div>
        </div>

        {/* Add Email */}
        <div className="flex gap-3 mt-6">
          <input
            type="email"
            placeholder="Enter email address..."
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="input-base flex-1"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !emailInput.trim()}
            className="btn-primary px-6 whitespace-nowrap disabled:opacity-50"
          >
            {adding ? 'Adding...' : '+ Add Email'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-base p-5 bg-gradient-to-br from-slate-50 to-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Recipients</p>
          <p className="text-4xl font-bold text-slate-900 mt-2">{totalRecipients}</p>
        </div>
        <div className="card-base p-5 bg-gradient-to-br from-green-50 to-green-100">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Active</p>
          <p className="text-4xl font-bold text-green-900 mt-2">{activeCount}</p>
        </div>
        <div className="card-base p-5 bg-gradient-to-br from-amber-50 to-amber-100">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Paused</p>
          <p className="text-4xl font-bold text-amber-900 mt-2">{pausedCount}</p>
        </div>
      </div>

      {/* How it works */}
      <div className="card-base p-5 bg-blue-50 border border-blue-200">
        <div className="flex gap-3">
          <span className="text-xl">ℹ️</span>
          <p className="text-sm text-blue-900">
            <strong>How it works:</strong> Emails listed here plus all users with agent or admin roles will
            automatically receive notifications for new orders, status changes, and payment proof updates.
            You can add any email — they don't need to be registered users.
          </p>
        </div>
      </div>

      {/* Email List */}
      <div className="card-base overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Email List</h2>
          <span className="text-sm text-slate-500">{totalRecipients} {totalRecipients === 1 ? 'recipient' : 'recipients'}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
        ) : recipients.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-slate-500 font-medium">No recipients added yet.</p>
            <p className="text-slate-400 text-sm mt-1">Add emails above to start receiving notifications.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recipients.map(recipient => (
              <li key={recipient.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                {/* Status dot */}
                <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${recipient.active ? 'bg-green-500' : 'bg-amber-400'}`} />

                {/* Email */}
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{recipient.email}</span>

                {/* Badge */}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  recipient.active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {recipient.active ? 'Active' : 'Paused'}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(recipient.id, recipient.active)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    recipient.active
                      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                      : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {recipient.active ? 'Pause' : 'Activate'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(recipient.id, recipient.email)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default NotificationRecipients
