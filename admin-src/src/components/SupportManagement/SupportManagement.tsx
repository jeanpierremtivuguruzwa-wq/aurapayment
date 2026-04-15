import React, { useEffect, useState, useRef } from 'react'
import {
  collection, onSnapshot, query, orderBy, doc,
  updateDoc, addDoc, Timestamp, getDocs
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

function fmt(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const CATEGORY: Record<string, string> = {
  transaction_delay: 'Transaction taking too long',
  proof_issue: 'Problem with proof of payment',
  wrong_amount: 'Wrong amount received',
  payment_failed: 'Payment failed',
  account_issue: 'Account issue',
  general: 'General question',
  other: 'Other',
}
const catLabel = (v: string) => CATEGORY[v] || v

const STATUS_STYLE: Record<string, string> = {
  open:    'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  closed:  'bg-green-50 text-green-700 border-green-200',
}
const STATUS_DOT: Record<string, string> = { open: '💬', pending: '⏳', closed: '✓' }

// ── Main Component ────────────────────────────────────────────────────────────
const SupportManagement: React.FC = () => {
  const [tickets, setTickets]         = useState<SupportTicket[]>([])
  const [agents, setAgents]           = useState<Agent[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'open' | 'pending' | 'closed'>('all')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages]       = useState<ChatMessage[]>([])
  const [msgLoading, setMsgLoading]   = useState(false)
  const [replyText, setReplyText]     = useState('')
  const [replySending, setReplySending] = useState(false)
  const [assignSaving, setAssignSaving] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const msgUnsubRef = useRef<(() => void) | null>(null)

  // ── Load agents ──────────────────────────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'agents')).then(snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agent[]
      setAgents(data.filter(a => a.status === 'active'))
    }).catch(() => {})
  }, [])

  // ── Load tickets (real-time) ──────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'supportTickets'), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as SupportTicket[]
      setTickets(data)
      setLoading(false)

      // Update selected ticket if open
      if (selectedTicket) {
        const updated = data.find(t => t.id === selectedTicket.id)
        if (updated) setSelectedTicket(updated)
      }
    }, () => setLoading(false))
    return () => unsub()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Actions ───────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    setReplySending(true)
    try {
      await addDoc(collection(db, 'supportTickets', selectedTicket.id, 'messages'), {
        text: replyText.trim(),
        senderId: 'admin',
        senderName: 'Support Team',
        role: 'admin',
        createdAt: Timestamp.now(),
      })
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        updatedAt: Timestamp.now(),
        status: 'pending',
      })
      setReplyText('')
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setReplySending(false)
    }
  }

  const assignAgent = async (agentEmail: string, agentName: string) => {
    if (!selectedTicket) return
    setAssignSaving(true)
    try {
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        assignedEmail: agentEmail || null,
        assignedAgentName: agentName || null,
        updatedAt: Timestamp.now(),
      })
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setAssignSaving(false)
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
    <div className="flex gap-4 h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* ── LEFT PANEL – Ticket list ── */}
      <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-3">

        {/* Stats */}
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

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Loading tickets…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              <div className="text-3xl mb-2">🎧</div>
              No {filter !== 'all' ? filter : ''} tickets
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
                <p className="text-xs text-slate-500 mb-1">{ticket.userName} · {ticket.userEmail}</p>
                <p className="text-xs text-slate-400 truncate">{ticket.message}</p>
                <p className="text-xs text-slate-300 mt-1">{ago(ticket.updatedAt)}</p>
                {ticket.assignedAgentName && (
                  <p className="text-xs text-sky-600 mt-1">👤 {ticket.assignedAgentName}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL – Ticket detail ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!selectedTicket ? (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-slate-300 gap-3">
            <div className="text-5xl">🎧</div>
            <p className="text-sm font-medium">Select a ticket to view the conversation</p>
          </div>
        ) : (
          <>
            {/* Ticket Header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800 text-base">{catLabel(selectedTicket.subject)}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedTicket.userName} · {selectedTicket.userEmail}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Opened {fmt(selectedTicket.createdAt)}</p>
                  {selectedTicket.orderId && (
                    <p className="text-xs text-sky-600 mt-1 font-mono">
                      📦 Order #{selectedTicket.orderId.slice(0, 8).toUpperCase()}
                    </p>
                  )}
                </div>

                {/* Status control */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedTicket.status}
                    onChange={e => updateStatus(e.target.value as any)}
                    disabled={statusSaving}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-semibold text-slate-700 focus:outline-none focus:border-sky-400"
                  >
                    <option value="open">💬 Open</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="closed">✓ Closed</option>
                  </select>
                </div>
              </div>

              {/* Agent Assignment */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Assign Support Agent</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedTicket.assignedEmail || ''}
                    onChange={e => {
                      const agent = agents.find(a => a.email === e.target.value)
                      assignAgent(e.target.value, agent?.name || '')
                    }}
                    disabled={assignSaving}
                    className="flex-1 min-w-0 text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-sky-400"
                  >
                    <option value="">— Unassigned —</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.email}>
                        {agent.name} ({agent.email})
                      </option>
                    ))}
                  </select>
                  {assignSaving && (
                    <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
                  )}
                  {selectedTicket.assignedEmail && !assignSaving && (
                    <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-xl px-2.5 py-1.5 text-xs text-sky-700 font-medium shrink-0">
                      <span>👤</span>
                      <span>{selectedTicket.assignedAgentName}</span>
                      <span className="text-sky-400">·</span>
                      <span className="font-mono">{selectedTicket.assignedEmail}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Choose which agent receives this user's support request today.
                </p>
              </div>
            </div>

            {/* Chat Thread */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col min-h-0">
              <div className="p-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversation</p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 200, maxHeight: 420 }}>
                {msgLoading ? (
                  <p className="text-center text-slate-400 text-sm mt-8">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm mt-8">No messages yet</p>
                ) : (
                  messages.map(msg => {
                    const isAdmin = msg.role === 'admin'
                    const initials = (msg.senderName || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)
                    const time = msg.createdAt
                      ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    return (
                      <div key={msg.id} className={`flex gap-2 items-end ${isAdmin ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isAdmin ? 'bg-sky-600 text-white' : 'bg-slate-700 text-white'}`}>
                          {isAdmin ? '🛡' : initials}
                        </div>
                        <div className="max-w-sm">
                          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${isAdmin ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                            {msg.text}
                          </div>
                          <p className={`text-xs text-slate-400 mt-1 ${isAdmin ? 'text-right' : ''}`}>
                            {msg.senderName} · {time}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Reply Box */}
              {selectedTicket.status !== 'closed' ? (
                <div className="p-4 border-t border-slate-100 flex gap-2">
                  <textarea
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-sky-400 font-inherit"
                    rows={2}
                    placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
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
                    className="mt-2 text-xs text-sky-600 hover:text-sky-800 font-medium"
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

export default SupportManagement
