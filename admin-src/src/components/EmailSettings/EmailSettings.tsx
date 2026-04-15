import React, { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'

interface MailDoc {
  id: string
  to: string[]
  message: { subject: string; html?: string; text?: string }
  type?: string
  orderId?: string
  createdAt?: Timestamp
  delivery?: {
    state: string
    error?: string
    endTime?: Timestamp
    leaseExpireTime?: Timestamp
    startTime?: Timestamp
    attempts?: number
  }
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUCCESS:    { label: '✓ Delivered',  cls: 'bg-green-100 text-green-800 border border-green-200' },
  PROCESSING: { label: '⏳ Processing', cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
  PENDING:    { label: '⏳ Pending',    cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  ERROR:      { label: '✗ Failed',     cls: 'bg-red-100 text-red-800 border border-red-200' },
  RETRY:      { label: '🔄 Retrying',  cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
}

const TYPE_BADGE: Record<string, string> = {
  order_completed:    '✅ Order Completed',
  order_cancelled:    '❌ Order Cancelled',
  proof_upload:       '📎 Proof Upload',
  new_order:          '🆕 New Order',
}

function formatTs(ts: Timestamp | undefined): string {
  if (!ts) return '—'
  try {
    const d = ts.toDate()
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

const EmailSettings: React.FC = () => {
  const [emails, setEmails] = useState<MailDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<MailDoc | null>(null)
  const [filter, setFilter] = useState<'all' | 'order_completed' | 'order_cancelled' | 'other'>('all')

  useEffect(() => {
    const q = query(
      collection(db, 'mail'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )

    const unsub = onSnapshot(q, snap => {
      setEmails(snap.docs.map(d => ({ id: d.id, ...d.data() } as MailDoc)))
      setLoading(false)
    }, () => setLoading(false))

    return () => unsub()
  }, [])

  const filtered = emails.filter(e => {
    if (filter === 'all') return true
    if (filter === 'other') return !e.type || (e.type !== 'order_completed' && e.type !== 'order_cancelled')
    return e.type === filter
  })

  const getState = (e: MailDoc) => {
    const state = e.delivery?.state?.toUpperCase() ?? 'PENDING'
    return STATUS_BADGE[state] ?? { label: state, cls: 'bg-slate-100 text-slate-700 border border-slate-200' }
  }

  const stats = {
    total:     emails.length,
    delivered: emails.filter(e => e.delivery?.state?.toUpperCase() === 'SUCCESS').length,
    pending:   emails.filter(e => !e.delivery?.state || e.delivery.state.toUpperCase() === 'PENDING' || e.delivery.state.toUpperCase() === 'PROCESSING').length,
    failed:    emails.filter(e => e.delivery?.state?.toUpperCase() === 'ERROR').length,
    toUsers:   emails.filter(e => e.type === 'order_completed' || e.type === 'order_cancelled').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">📧 Email Notifications</h2>
          <p className="text-slate-500 text-sm mt-1">
            Automatic emails sent to users when their orders are completed or cancelled.
          </p>
        </div>
      </div>

      {/* How it works banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-5">
        <h3 className="font-semibold text-sky-800 mb-3 flex items-center gap-2">
          <span>ℹ️</span> How Automatic Emails Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-sky-700">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <p className="font-semibold">Order Placed</p>
              <p className="text-sky-600">Admin & agents receive a notification email</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold">Marked Complete</p>
              <p className="text-sky-600">User gets a "Transaction Completed" email automatically</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-semibold">Cancelled</p>
              <p className="text-sky-600">User gets a "Transaction Cancelled" email automatically</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Sent',      value: stats.total,     icon: '📧', cls: 'text-slate-700' },
          { label: 'Delivered',       value: stats.delivered, icon: '✓',  cls: 'text-green-700' },
          { label: 'Pending',         value: stats.pending,   icon: '⏳', cls: 'text-amber-700' },
          { label: 'Failed',          value: stats.failed,    icon: '✗',  cls: 'text-red-700' },
          { label: 'To Users',        value: stats.toUsers,   icon: '👤', cls: 'text-sky-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all',              label: `All (${emails.length})` },
          { key: 'order_completed',  label: `✅ Completed` },
          { key: 'order_cancelled',  label: `❌ Cancelled` },
          { key: 'other',            label: 'Other' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === tab.key
                ? 'bg-sky-600 text-white shadow'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Email log table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading email log…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-slate-500 font-medium">No emails logged yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Emails will appear here automatically when orders are completed or cancelled
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Recipient</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Sent At</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(email => {
                  const state = getState(email)
                  const typeLabel = email.type ? (TYPE_BADGE[email.type] ?? email.type) : '📧 Notification'
                  return (
                    <tr key={email.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-slate-700 font-medium max-w-[200px] truncate">
                          {email.to?.join(', ') || '—'}
                        </div>
                        {email.orderId && (
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            #{email.orderId.slice(0, 8)}…
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700 max-w-[220px] block truncate">
                          {email.message?.subject || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-600">{typeLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${state.cls}`}>
                          {state.label}
                        </span>
                        {email.delivery?.attempts && email.delivery.attempts > 1 && (
                          <span className="block text-xs text-slate-400 mt-0.5">
                            {email.delivery.attempts} attempts
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatTs(email.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {email.message?.html ? (
                          <button
                            onClick={() => setPreview(email)}
                            className="text-sky-600 hover:text-sky-800 text-xs font-medium underline"
                          >
                            View email
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email preview modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800 truncate max-w-md">
                  {preview.message?.subject}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">To: {preview.to?.join(', ')}</p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <iframe
                srcDoc={preview.message?.html || '<p>No HTML content</p>'}
                className="w-full rounded-lg"
                style={{ height: '500px', border: 'none' }}
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EmailSettings
