import React, { useEffect, useState, useRef } from 'react'
import {
  collection, onSnapshot, query, orderBy,
  where, doc, updateDoc, addDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Agent } from '../../types/Agent'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SupportTicket {
  id: string
  userId: string
  userEmail: string
  userName: string
  subject: string
  message: string
  status: 'open' | 'pending' | 'closed'
  createdAt: any
  updatedAt: any
  orderId?: string | null
  assignedEmail?: string | null
  assignedAgentName?: string | null
}

interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  role: 'user' | 'agent' | 'admin'
  createdAt: any
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ago(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CATEGORY: Record<string, string> = {
  transaction_delay: 'Transaction taking too long',
  proof_issue:       'Problem with proof of payment',
  wrong_amount:      'Wrong amount received',
  payment_failed:    'Payment failed',
  account_issue:     'Account issue',
  general:           'General question',
  other:             'Other',
}
const catLabel = (v: string) => CATEGORY[v] || v

const STATUS_STYLE: Record<string, string> = {
  open:    'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  closed:  'bg-green-50 text-green-700 border-green-200',
}
const STATUS_DOT: Record<string, string> = { open: '💬', pending: '⏳', closed: '✓' }

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  agent: Agent
}

const AgentSupportView: React.FC<Props> = ({ agent }) => {
  const [tickets, setTickets]             = useState<SupportTicket[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<'all' | 'open' | 'pending' | 'closed'>('all')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages]           = useState<ChatMessage[]>([])
  const [msgLoading, setMsgLoading]       = useState(false)
  const [replyText, setReplyText]         = useState('')
  const [replySending, setReplySending]   = useState(false)
  const [statusSaving, setStatusSaving]   = useState(false)
  const chatEndRef   = useRef<HTMLDivElement>(null)
  const msgUnsubRef  = useRef<(() => void) | null>(null)

  // ── Load tickets assigned to this agent ───────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'supportTickets'),
      where('assignedEmail', '==', agent.email),
      orderBy('updatedAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as SupportTicket[]
      setTickets(data)
      setLoading(false)
      // Refresh selected ticket
      if (selectedTicket) {
        const updated = data.find(t => t.id === selectedTicket.id)
        if (updated) setSelectedTicket(updated)
      }
    }, () => setLoading(false))
    return () => unsub()
  }, [agent.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages for selected ticket ────────────────────────────────────
  useEffect(() => {
    if (msgUnsubRef.current) { msgUnsubRef.current(); msgUnsubRef.current = null }
    if (!selectedTicket) { setMessages([]); return }

    setMsgLoading(true)
    const q = query(
      collection(db, 'supportTickets', selectedTicket.id, 'messages'),
      orderBy('createdAt', 'asc')
    )
    msgUnsubRef.current = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ChatMessage[]
      setMessages(msgs)
      setMsgLoading(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }, () => setMsgLoading(false))

    return () => { if (msgUnsubRef.current) msgUnsubRef.current() }
  }, [selectedTicket?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send reply ────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    setReplySending(true)
    try {
      await addDoc(collection(db, 'supportTickets', selectedTicket.id, 'messages'), {
        text:       replyText.trim(),
        senderId:   agent.id,
        senderName: agent.name,
        role:       'agent',
        createdAt:  Timestamp.now(),
      })
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        updatedAt: Timestamp.now(),
        status:    'pending',
      })
      setReplyText('')
    } catch (e) {
      alert('Error sending reply: ' + (e as Error).message)
    } finally {
      setReplySending(false)
    }
  }

  const updateStatus = async (status: 'open' | 'pending' | 'closed') => {
    if (!selectedTicket) return
    setStatusSaving(true)
    try {
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        status,
        updatedAt: Timestamp.now(),
      })
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setStatusSaving(false)
    }
  }

  // ── Filtered tickets ──────────────────────────────────────────────────────
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  const counts = {
    all:     tickets.length,
    open:    tickets.filter(t => t.status === 'open').length,
    pending: tickets.filter(t => t.status === 'pending').length,
    closed:  tickets.filter(t => t.status === 'closed').length,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* ── LEFT PANEL ── */}
      <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-3">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
            🎧 My Support Queue
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Tickets assigned to you by the admin</p>
        </div>

        {/* Filter tabs */}
        <div className="grid grid-cols-4 gap-2">
          {(['all', 'open', 'pending', 'closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl p-2 text-center text-xs font-semibold border transition-all ${
                filter === f
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-lg font-bold">{counts[f]}</div>
              <div className="capitalize">{f}</div>
            </button>
          ))}
        </div>

        {/* Ticket list */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-slate-400 text-sm">
                {filter !== 'all' ? `No ${filter} tickets` : 'No tickets assigned to you yet'}
              </p>
              <p className="text-slate-300 text-xs mt-1">The admin will assign tickets here</p>
            </div>
          ) : (
            filtered.map(ticket => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 ${
                  selectedTicket?.id === ticket.id ? 'bg-sky-50 border-l-4 border-l-sky-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-slate-800 text-sm leading-tight truncate flex-1">
                    {catLabel(ticket.subject)}
                  </p>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[ticket.status]}`}>
                    {STATUS_DOT[ticket.status]} {ticket.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-0.5">{ticket.userName}</p>
                <p className="text-xs text-slate-400 truncate">{ticket.message}</p>
                <p className="text-xs text-slate-300 mt-1">{ago(ticket.updatedAt)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL – Chat ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!selectedTicket ? (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-3 text-slate-300 p-8">
            <div className="text-5xl">🎧</div>
            <p className="text-sm font-medium text-center">Select a ticket to start answering</p>
          </div>
        ) : (
          <>
            {/* Ticket header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-slate-800">{catLabel(selectedTicket.subject)}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedTicket.userName} · {selectedTicket.userEmail}
                  </p>
                  {selectedTicket.orderId && (
                    <p className="text-xs text-sky-600 font-mono mt-1">
                      📦 Order #{selectedTicket.orderId.slice(0, 8).toUpperCase()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={e => updateStatus(e.target.value as any)}
                    disabled={statusSaving}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-semibold text-slate-700 focus:outline-none focus:border-sky-400"
                  >
                    <option value="open">💬 Open</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="closed">✓ Close ticket</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Chat window */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col min-h-0">
              <div className="p-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversation</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 200, maxHeight: 450 }}>
                {msgLoading ? (
                  <p className="text-center text-slate-400 text-sm mt-8">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm mt-8">No messages yet — be the first to reply</p>
                ) : (
                  messages.map(msg => {
                    const isAgent = msg.role === 'agent' || msg.role === 'admin'
                    const initials = (msg.senderName || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)
                    const time = msg.createdAt
                      ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    return (
                      <div key={msg.id} className={`flex gap-2 items-end ${isAgent ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isAgent ? 'bg-sky-600 text-white' : 'bg-slate-700 text-white'}`}>
                          {isAgent ? '🎧' : initials}
                        </div>
                        <div className="max-w-sm">
                          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${isAgent ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                            {msg.text}
                          </div>
                          <p className={`text-xs text-slate-400 mt-1 ${isAgent ? 'text-right' : ''}`}>
                            {msg.senderName} · {time}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Reply box */}
              {selectedTicket.status !== 'closed' ? (
                <div className="p-4 border-t border-slate-100 flex gap-2">
                  <textarea
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-sky-400"
                    rows={2}
                    placeholder="Type your reply to the user… (Enter to send, Shift+Enter for new line)"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
                    }}
                    disabled={replySending}
                  />
                  <button
                    onClick={sendReply}
                    disabled={replySending || !replyText.trim()}
                    className="w-10 h-10 self-end bg-sky-600 text-white rounded-xl flex items-center justify-center text-base hover:bg-sky-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Send reply"
                  >
                    ➤
                  </button>
                </div>
              ) : (
                <div className="p-4 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-400">This ticket is closed.</p>
                  <button
                    onClick={() => updateStatus('open')}
                    className="mt-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                  >
                    Reopen ticket
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AgentSupportView
