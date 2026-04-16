import React, { useEffect, useMemo, useState } from 'react'
import {
  collection, onSnapshot, query, orderBy, limit, where,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useUsers } from '../../hooks/useUsers'
import { useAgents } from '../../hooks/useAgents'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions'
import { AppUser } from '../../types/AppUser'
import { Inbox, Package, DollarSign, MousePointerClick, FileText, Radio, Compass } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function ago(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function fmtTime(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

function isOnline(lastSeen: any): boolean {
  if (!lastSeen) return false
  const d = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen.seconds * 1000)
  return Date.now() - d.getTime() < ONLINE_THRESHOLD_MS
}

// ── event types ───────────────────────────────────────────────────────────────

type EventKind = 'order' | 'transaction'
interface FeedEvent {
  id: string
  kind: EventKind
  userId: string
  userName: string
  label: string
  detail: string
  status: string
  ts: any
}

// ── Status badge ─────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending:   'bg-yellow-100 text-yellow-700',
    uploaded:  'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colours[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ── Live Feed panel ──────────────────────────────────────────────────────────

function LiveFeed({ events }: { events: FeedEvent[] }) {
  return (
    <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
      {events.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No events yet</p>
        </div>
      )}
      {events.map(ev => (
        <div key={ev.kind + ev.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
          <span className="flex items-center mt-0.5">{ev.kind === 'order' ? <Package className="w-5 h-5 text-slate-500" /> : <DollarSign className="w-5 h-5 text-slate-500" />}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{ev.userName || 'Unknown user'}</span>
              <Badge status={ev.status} />
            </div>
            <p className="text-xs text-gray-600 mt-0.5 truncate">{ev.label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{ev.detail}</p>
          </div>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">{ago(ev.ts)}</span>
        </div>
      ))}
    </div>
  )
}

// ── User Journey panel ───────────────────────────────────────────────────────

function UserJourney({
  users,
  events,
}: {
  users: AppUser[]
  events: FeedEvent[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u =>
      !q ||
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    )
  }, [users, search])

  const selected = users.find(u => u.id === selectedId)
  const userEvents = useMemo(
    () => events.filter(e => e.userId === selectedId).sort((a, b) => {
      const ta = a.ts?.seconds ?? 0
      const tb = b.ts?.seconds ?? 0
      return tb - ta
    }),
    [events, selectedId]
  )

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* User list */}
      <div className="w-64 flex-shrink-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-100 bg-gray-50">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.map(u => {
            const count = events.filter(e => e.userId === u.id).length
            return (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id === selectedId ? null : u.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-indigo-50 transition-colors ${
                  selectedId === u.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                      {(u.fullName || u.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 truncate">{u.fullName || u.email}</p>
                    <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                    {count > 0 && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        {count} events
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No users found</p>
          )}
        </div>
      </div>

      {/* Journey timeline */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <MousePointerClick className="w-10 h-10 mb-3 mx-auto text-gray-300" />
            <p className="font-medium text-sm">Select a user to see their activity flow</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              {selected.photoURL ? (
                <img src={selected.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                  {(selected.fullName || selected.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-bold text-gray-900 text-sm">{selected.fullName || '—'}</p>
                <p className="text-xs text-gray-400">{selected.email}</p>
              </div>
              <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${
                (selected.status || 'active') === 'active'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {selected.role || 'user'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {userEvents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-8">No recorded events for this user</p>
              ) : (
                <ol className="relative border-l border-indigo-100 ml-3 space-y-4">
                  {userEvents.map(ev => (
                    <li key={ev.kind + ev.id} className="ml-5">
                      <span className="absolute -left-1.5 flex items-center justify-center w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-white text-white text-[8px]">
                        {ev.kind === 'order' ? <Package className="w-2 h-2" /> : <DollarSign className="w-2 h-2" />}
                      </span>
                      <p className="text-xs font-semibold text-gray-900">{ev.label}</p>
                      <p className="text-[11px] text-gray-500">{ev.detail}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge status={ev.status} />
                        <span className="text-[10px] text-gray-400">{fmtTime(ev.ts)} · {ago(ev.ts)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Online Now panel ─────────────────────────────────────────────────────────

interface UserWithPresence extends AppUser {
  lastSeen?: any
  currentPage?: string
}

function OnlineNow({ agents }: { agents: any[] }) {
  const [usersWithPresence, setUsersWithPresence] = useState<UserWithPresence[]>([])

  useEffect(() => {
    const fiveMinsAgo = new Date(Date.now() - ONLINE_THRESHOLD_MS)
    const q = query(
      collection(db, 'users'),
      where('lastSeen', '>=', fiveMinsAgo),
      orderBy('lastSeen', 'desc'),
      limit(50)
    )
    return onSnapshot(q, snap => {
      setUsersWithPresence(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserWithPresence)))
    }, () => {
      // Fallback if index not ready — load all users and filter client side
      const qAll = query(collection(db, 'users'), orderBy('lastSeen', 'desc'), limit(100))
      onSnapshot(qAll, snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserWithPresence))
        setUsersWithPresence(all.filter(u => isOnline(u.lastSeen)))
      })
    })
  }, [])

  const onlineAgents = agents.filter(a => a.status === 'active')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Online Agents */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center justify-between">
          <h3 className="font-bold text-green-900 text-sm flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Agents Online</h3>
          <span className="text-xs bg-green-200 text-green-800 font-bold px-2 py-0.5 rounded-full">{onlineAgents.length}</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {onlineAgents.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No active agents</p>
          )}
          {onlineAgents.map(agent => (
            <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
                <p className="text-xs text-gray-400 truncate">{agent.email}</p>
              </div>
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">Active</span>
            </div>
          ))}
        </div>
      </div>

      {/* Online Users */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-blue-50 flex items-center justify-between">
          <h3 className="font-bold text-blue-900 text-sm flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Users Online Now</h3>
          <span className="text-xs bg-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded-full">{usersWithPresence.length}</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {usersWithPresence.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No users active in the last 5 minutes</p>
          )}
          {usersWithPresence.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />
              {u.photoURL ? (
                <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                  {(u.fullName || u.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{u.fullName || u.email || '—'}</p>
                <p className="text-xs text-gray-400 truncate">
                  {u.currentPage ? <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5 inline" /> {u.currentPage}</span> : u.email}
                </p>
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{ago(u.lastSeen)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = 'feed' | 'journey' | 'online'

const LiveActivity: React.FC = () => {
  const [tab, setTab] = useState<Tab>('feed')
  const { users } = useUsers()
  const { agents } = useAgents()
  const { orders } = useRealtimeOrders()
  const { transactions } = useRealtimeTransactions()

  // Build unified event feed from orders + transactions
  const events = useMemo<FeedEvent[]>(() => {
    const userMap: Record<string, string> = {}
    users.forEach(u => { userMap[u.id] = u.fullName || u.email || u.id })

    const orderEvents: FeedEvent[] = orders
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
      .map(o => ({
        id: o.id,
        kind: 'order',
        userId: o.userId || '',
        userName: userMap[o.userId] || o.userEmail || o.senderName || 'Unknown',
        label: `Order — ${o.sendAmount} ${o.sendCurrency} → ${o.receiveCurrency}`,
        detail: `To: ${o.recipientName || '—'} · via ${o.provider || o.deliveryMethod || '—'}`,
        status: o.status,
        ts: o.createdAt,
      }))

    const txEvents: FeedEvent[] = transactions.map(tx => ({
      id: tx.id,
      kind: 'transaction',
      userId: tx.userId || '',
      userName: userMap[tx.userId || ''] || 'Unknown',
      label: `Transaction — ${tx.amountSent} ${tx.currencySent}`,
      detail: `Recipient: ${tx.recipientName || '—'}`,
      status: tx.status,
      ts: tx.timestamp,
    }))

    return [...orderEvents, ...txEvents].sort((a, b) => {
      const ta = a.ts?.seconds ?? 0
      const tb = b.ts?.seconds ?? 0
      return tb - ta
    })
  }, [orders, transactions, users])

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'feed',    label: 'Live Feed',    icon: <Radio className="w-4 h-4" /> },
    { id: 'journey', label: 'User Journey', icon: <Compass className="w-4 h-4" /> },
    { id: 'online',  label: 'Online Now',   icon: <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">Trace user & agent journeys in real time</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Live · {events.length} events
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'feed'    && <LiveFeed events={events} />}
      {tab === 'journey' && <UserJourney users={users} events={events} />}
      {tab === 'online'  && <OnlineNow agents={agents} />}
    </div>
  )
}

export default LiveActivity
