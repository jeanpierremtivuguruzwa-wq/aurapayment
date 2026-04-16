import React, { useEffect, useState } from 'react'
import {
  collection, addDoc, deleteDoc, doc, updateDoc,
  serverTimestamp, onSnapshot, query, where,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { Agent } from '../../types/Agent'
import { AppUser } from '../../types/AppUser'

// ── Types ──────────────────────────────────────────────────────────────────
interface Recipient {
  id: string
  email: string
  name: string
  type: 'admin' | 'agent' | 'custom'
  agentId?: string
  userId?: string
  active: boolean
  createdAt?: any
}

// ── Helpers ────────────────────────────────────────────────────────────────
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

function Avatar({ name, size = 9 }: { name?: string; size?: number }) {
  const safe = name || '?'
  const initials = safe.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
  const s = `w-${size} h-${size}`
  return (
    <div className={`${s} rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
const NotificationRecipients: React.FC = () => {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [admins, setAdmins] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  // custom-email add form
  const [emailInput, setEmailInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  // ── Live listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    let recipDone = false, agentsDone = false, adminsDone = false
    const check = () => { if (recipDone && agentsDone && adminsDone) setLoading(false) }

    const recipUnsub = onSnapshot(query(collection(db, 'notificationRecipients')), snap => {
      setRecipients(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Recipient[])
      recipDone = true; check()
    })
    const agentsUnsub = onSnapshot(query(collection(db, 'agents')), snap => {
      setAgents(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Agent[])
      agentsDone = true; check()
    })
    const adminsUnsub = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'admin')),
      snap => {
        setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })) as AppUser[])
        adminsDone = true; check()
      },
      () => { adminsDone = true; check() }
    )

    return () => { recipUnsub(); agentsUnsub(); adminsUnsub() }
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────
  const recipByEmail = Object.fromEntries(recipients.map(r => [r.email, r]))
  const customRecipients = recipients.filter(r => r.type === 'custom' || (!r.type))

  // Stats across all sections
  const activeAdmins = admins.filter(a => recipByEmail[a.email]?.active).length
  const activeAgents = agents.filter(a => recipByEmail[a.email]?.active).length
  const activeCustom = customRecipients.filter(r => r.active).length
  const totalActive = activeAdmins + activeAgents + activeCustom
  const totalAll = admins.length + agents.length + customRecipients.length

  // ── Actions ─────────────────────────────────────────────────────────────
  async function enablePerson(
    email: string,
    name: string,
    type: 'admin' | 'agent' | 'custom',
    extra: { agentId?: string; userId?: string } = {}
  ) {
    const existing = recipByEmail[email]
    if (existing) {
      await updateDoc(doc(db, 'notificationRecipients', existing.id), { active: true, name })
    } else {
      await addDoc(collection(db, 'notificationRecipients'), {
        email, name, type, active: true,
        ...(extra.agentId ? { agentId: extra.agentId } : {}),
        ...(extra.userId ? { userId: extra.userId } : {}),
        createdAt: serverTimestamp(),
      })
    }
  }

  async function disablePerson(email: string) {
    const existing = recipByEmail[email]
    if (existing) {
      await updateDoc(doc(db, 'notificationRecipients', existing.id), { active: false })
    }
  }

  async function handleTogglePerson(
    email: string,
    name: string,
    type: 'admin' | 'agent' | 'custom',
    extra?: { agentId?: string; userId?: string }
  ) {
    const key = email
    setToggling(key)
    try {
      const isActive = recipByEmail[email]?.active
      if (isActive) {
        await disablePerson(email)
      } else {
        await enablePerson(email, name, type, extra)
      }
    } finally {
      setToggling(null)
    }
  }

  async function handleAddCustom() {
    const email = emailInput.trim().toLowerCase()
    const name = nameInput.trim()
    if (!email || !name) return
    if (!isValidEmail(email)) { alert('Please enter a valid email address.'); return }
    if (recipByEmail[email]) { alert('This email is already in the list.'); return }
    setAdding(true)
    try {
      await addDoc(collection(db, 'notificationRecipients'), {
        email, name, type: 'custom', active: true, createdAt: serverTimestamp(),
      })
      setEmailInput(''); setNameInput('')
    } catch (err) {
      alert('Error adding: ' + (err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteCustom(id: string, email: string) {
    if (!confirm(`Remove ${email}?`)) return
    await deleteDoc(doc(db, 'notificationRecipients', id))
  }

  async function handleToggleCustom(r: Recipient) {
    setToggling(r.id)
    try {
      await updateDoc(doc(db, 'notificationRecipients', r.id), { active: !r.active })
    } finally {
      setToggling(null)
    }
  }

  // ── Row renderer for admin / agent sections ─────────────────────────────
  function PersonRow({
    email, name, type, extra, photoURL,
  }: {
    email: string; name: string; type: 'admin' | 'agent' | 'custom'
    extra?: { agentId?: string; userId?: string }
    photoURL?: string
  }) {
    const recip = recipByEmail[email]
    const isActive = recip?.active ?? false
    const isLoading = toggling === email

    return (
      <li className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
        {/* Avatar */}
        {photoURL ? (
          <img src={photoURL} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <Avatar name={name} size={9} />
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-slate-400 truncate">{email}</p>
        </div>

        {/* Status badge */}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
          isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {isActive ? 'Active' : 'Off'}
        </span>

        {/* Toggle */}
        <button
          onClick={() => handleTogglePerson(email, name, type, extra)}
          disabled={isLoading}
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
            isActive ? 'bg-green-500' : 'bg-slate-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            isActive ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </li>
    )
  }

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="card-base p-6 h-32 bg-slate-100 rounded-2xl" />
        <div className="card-base p-6 h-48 bg-slate-100 rounded-2xl" />
        <div className="card-base p-6 h-48 bg-slate-100 rounded-2xl" />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="card-base p-6">
        <h1 className="text-2xl font-bold text-slate-900">Notification Recipients</h1>
        <p className="text-slate-500 text-sm mt-1">
          Choose who receives an email when a new order arrives. Toggle anyone on or off instantly.
        </p>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="rounded-xl bg-gradient-to-br from-sky-50 to-sky-100 p-4">
            <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide">Total People</p>
            <p className="text-3xl font-bold text-sky-900 mt-1">{totalAll}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100 p-4">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Receiving Now</p>
            <p className="text-3xl font-bold text-green-900 mt-1">{totalActive}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Paused</p>
            <p className="text-3xl font-bold text-slate-700 mt-1">{totalAll - totalActive}</p>
          </div>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="card-base p-4 bg-blue-50 border border-blue-100 flex gap-3 items-start">
        <span className="text-lg mt-0.5">ℹ️</span>
        <p className="text-sm text-blue-900">
          Toggle the switch next to any admin or agent to include or exclude them from new-order emails.
          Add extra emails in the <strong>Extra Emails</strong> section below for external recipients.
        </p>
      </div>

      {/* ── Admins section ── */}
      <div className="card-base overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-900">Admins</h2>
            <p className="text-xs text-slate-400">{activeAdmins} of {admins.length} receiving</p>
          </div>
        </div>
        {admins.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">No admin accounts found.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {admins.map(admin => (
              <PersonRow
                key={admin.id}
                email={admin.email}
                name={admin.fullName || admin.displayName || admin.email || ''}
                type="admin"
                extra={{ userId: admin.id }}
                photoURL={admin.photoURL}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Agents section ── */}
      <div className="card-base overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-900">Agents</h2>
            <p className="text-xs text-slate-400">{activeAgents} of {agents.length} receiving</p>
          </div>
        </div>
        {agents.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">No agents found. Add agents in Agent Management.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {agents.map(agent => (
              <PersonRow
                key={agent.id}
                email={agent.email}
                name={agent.name || ''}
                type="agent"
                extra={{ agentId: agent.id }}
                photoURL={agent.photoURL}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Extra Emails section ── */}
      <div className="card-base overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="text-lg">✉️</span>
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-900">Extra Emails</h2>
            <p className="text-xs text-slate-400">External recipients not tied to an account</p>
          </div>
        </div>

        {/* Add form */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Full name..."
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="input-base flex-1"
            />
            <input
              type="email"
              placeholder="Email address..."
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
              className="input-base flex-1"
            />
            <button
              onClick={handleAddCustom}
              disabled={adding || !emailInput.trim() || !nameInput.trim()}
              className="btn-primary px-6 whitespace-nowrap disabled:opacity-50"
            >
              {adding ? 'Adding…' : '+ Add'}
            </button>
          </div>
        </div>

        {customRecipients.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            No extra emails yet. Add one above.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {customRecipients.map(r => (
              <li key={r.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                {/* Avatar */}
                <Avatar name={r.name || r.email || ''} size={9} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.name || '—'}</p>
                  <p className="text-xs text-slate-400 truncate">{r.email}</p>
                </div>

                {/* Status */}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                  r.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {r.active ? 'Active' : 'Off'}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => handleToggleCustom(r)}
                  disabled={toggling === r.id}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                    r.active ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    r.active ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteCustom(r.id, r.email)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
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
