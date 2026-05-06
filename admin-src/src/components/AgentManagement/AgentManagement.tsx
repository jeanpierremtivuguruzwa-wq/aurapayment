import React from 'react'
import { useAgents } from '../../hooks/useAgents'
import { AgentPermission } from '../../types/Agent'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import {
  BarChart2, Package, Users, ArrowLeftRight, CreditCard, UserCheck, TrendingUp, MessageCircle, Wallet, Landmark, Bell, Headphones, UserCog,
  Shield, Check, X, ChevronDown, Plus, AlertCircle, Calendar, Mail, Zap
} from 'lucide-react'

function useMonthlyCompletedOrders(): Record<string, number> {
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  React.useEffect(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'completed'),
      where('completedAt', '>=', Timestamp.fromDate(startOfMonth))
    )
    return onSnapshot(q, (snap) => {
      const c: Record<string, number> = {}
      snap.docs.forEach(d => {
        const claimedBy = d.data().claimedBy as string | undefined
        if (claimedBy) c[claimedBy] = (c[claimedBy] || 0) + 1
      })
      setCounts(c)
    }, () => {})
  }, [])
  return counts
}

const ALL_PERMISSIONS: { key: AgentPermission; label: string; desc: string; icon: React.ReactNode; default?: boolean }[] = [
  { key: 'transactions',        label: 'Transactions',          desc: 'View & manage transactions',            icon: <BarChart2 className="w-4 h-4" />, default: true },
  { key: 'orders',              label: 'Orders',                desc: 'View, complete & cancel orders',        icon: <Package className="w-4 h-4" /> },
  { key: 'users',               label: 'User Management',       desc: 'View registered users',                 icon: <Users className="w-4 h-4" /> },
  { key: 'currency',            label: 'Currency Pairs',        desc: 'View & edit currency rates',            icon: <ArrowLeftRight className="w-4 h-4" /> },
  { key: 'payments',            label: 'Payment Methods',       desc: 'View & edit payment methods',           icon: <CreditCard className="w-4 h-4" /> },
  { key: 'cardholders',         label: 'Cardholders',           desc: 'View & manage cardholders',             icon: <UserCheck className="w-4 h-4" /> },
  { key: 'cardholder-activity', label: 'Cardholder Activity',   desc: 'View cardholder transaction activity',  icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'chat',                label: 'AuraChat',              desc: 'Access the internal chat system',       icon: <MessageCircle className="w-4 h-4" /> },
  { key: 'wallet',              label: 'AuraWallet',            desc: 'View & manage Aura wallet records',     icon: <Wallet className="w-4 h-4" /> },
  { key: 'currency-assignments',label: 'Currency Assignments',  desc: 'Manage cardholder currency assignments', icon: <Landmark className="w-4 h-4" /> },
  { key: 'notifications',       label: 'Notifications',         desc: 'Manage notification recipients',        icon: <Bell className="w-4 h-4" /> },
  { key: 'support',             label: 'User Support',          desc: 'Answer user support tickets and chat',  icon: <Headphones className="w-4 h-4" /> },
]

// ── Agent Card Component ──

function AgentCard({
  agent,
  monthlyOrders,
  onEditPermissions,
  onStatusToggle,
  onRemovePerm,
  onAddPerm,
}: {
  agent: any
  monthlyOrders: number
  onEditPermissions: () => void
  onStatusToggle: () => void
  onRemovePerm: (perm: AgentPermission) => void
  onAddPerm: (perm: AgentPermission) => void
}) {
  const [showPermMenu, setShowPermMenu] = React.useState(false)
  const perms = agent.permissions || ['transactions']
  const status = agent.status || 'active'
  const available = ALL_PERMISSIONS.filter(p => !perms.includes(p.key))

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A'
    try {
      const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return 'N/A' }
  }

  const getInitials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)

  return (
    <div className={`rounded-2xl border p-5 transition-all ${
      status === 'suspended'
        ? 'bg-gray-50 border-gray-200'
        : 'bg-white border-indigo-100 shadow-sm hover:shadow-md'
    }`}>

      {/* ── Top: Avatar, Name, Status, Quick Stats ── */}
      <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          {agent.photoURL ? (
            <img src={agent.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200 flex-shrink-0" />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
              status === 'active'
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-700'
                : 'bg-gray-300'
            }`}>
              {getInitials(agent.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-base">{agent.name}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />{agent.email}
            </p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />Added {formatDate(agent.createdAt)}
            </p>
          </div>
        </div>

        {/* Status & Quick Stats */}
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
            status === 'active'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-red-100 text-red-700'
          }`}>
            <span className="w-2 h-2 rounded-full bg-current" />
            {status === 'active' ? 'Active' : 'Suspended'}
          </span>
          <div className="text-right">
            <p className="text-lg font-bold text-indigo-600">{monthlyOrders}</p>
            <p className={`text-xs ${monthlyOrders > 0 ? 'text-gray-500' : 'text-gray-400'}`}>
              orders this month
            </p>
          </div>
        </div>
      </div>

      {/* ── Permissions Section ── */}
      <div className="mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            Permissions
          </h4>
          <div className="flex items-center gap-2">
            {/* Compact count badge — click to expand */}
            <button
              onClick={() => setShowPermMenu(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 text-xs font-semibold border border-gray-200 transition-colors"
            >
              {perms.length} permission{perms.length !== 1 ? 's' : ''}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPermMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Expanded permission list */}
        {showPermMenu && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
            {/* Existing permissions */}
            <div className="flex flex-wrap gap-2">
              {(perms as AgentPermission[]).map((perm: AgentPermission) => {
                const p = ALL_PERMISSIONS.find(x => x.key === perm)
                return (
                  <div
                    key={perm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100"
                  >
                    <span>{p?.icon}</span>
                    {p?.label}
                    <button
                      onClick={() => onRemovePerm(perm)}
                      className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Add permission dropdown */}
            {available.length > 0 && (
              <div className="pt-1 border-t border-gray-200">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Add permission</p>
                <div className="flex flex-wrap gap-2">
                  {available.map(p => (
                    <button
                      key={p.key}
                      onClick={() => { onAddPerm(p.key); setShowPermMenu(false) }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-dashed border-gray-300 text-gray-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {available.length === 0 && (
              <p className="text-xs text-gray-400 italic pt-1 border-t border-gray-200">All permissions granted</p>
            )}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-2 justify-end">
        {status === 'active' ? (
          <button
            onClick={onStatusToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Suspend
          </button>
        ) : (
          <button
            onClick={onStatusToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Activate
          </button>
        )}
        <button
          onClick={onEditPermissions}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors"
        >
          <Zap className="w-3.5 h-3.5" /> Full Editor
        </button>
      </div>
    </div>
  )
}

// ── Main Component ──

const AgentManagement: React.FC = () => {
  const { agents, permissionRequests, loading, addAgent, updatePermissions, updateStatus, resolveRequest } = useAgents()
  const monthlyCompleted = useMonthlyCompletedOrders()

  const [showForm, setShowForm] = React.useState(false)
  const [formName, setFormName] = React.useState('')
  const [formEmail, setFormEmail] = React.useState('')
  const [formSubmitting, setFormSubmitting] = React.useState(false)

  const [editingAgent, setEditingAgent] = React.useState<string | null>(null)
  const [editPerms, setEditPerms] = React.useState<AgentPermission[]>([])
  const [savingPerms, setSavingPerms] = React.useState(false)

  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  const pendingRequests = permissionRequests.filter(r => r.status === 'pending')

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A'
    try {
      const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return 'N/A' }
  }

  const handleAddAgent = async () => {
    if (!formName.trim() || !formEmail.trim()) return
    setFormSubmitting(true)
    try {
      await addAgent(formName.trim(), formEmail.trim())
      setFormName('')
      setFormEmail('')
      setShowForm(false)
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const togglePerm = (perm: AgentPermission) => {
    setEditPerms(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    )
  }

  const savePerms = async () => {
    if (!editingAgent) return
    setSavingPerms(true)
    try {
      await updatePermissions(editingAgent, editPerms)
      setEditingAgent(null)
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSavingPerms(false)
    }
  }

  const handleStatusToggle = async (agentId: string, current: string) => {
    const next = current === 'suspended' ? 'active' : 'suspended'
    setActionLoading(agentId)
    try { await updateStatus(agentId, next as any) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setActionLoading(null) }
  }

  const handleResolve = async (
    requestId: string,
    resolution: 'approved' | 'denied',
    agentId: string,
    permission: AgentPermission,
    currentPermissions: AgentPermission[],
  ) => {
    setActionLoading(requestId)
    try {
      await resolveRequest(requestId, resolution, agentId, permission, currentPermissions)
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-48 bg-slate-200 rounded" />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCog className="w-6 h-6 text-indigo-600" />
            Agent Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">Assign and manage agent permissions</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Add Agent'}
        </button>
      </div>

      {/* ── Add Agent Form ── */}
      {showForm && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-5">
          <h3 className="text-sm font-semibold text-indigo-900 mb-3">New Agent</h3>
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <input
              type="text"
              placeholder="Full Name"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="flex-1 border border-indigo-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <input
              type="email"
              placeholder="Email address"
              value={formEmail}
              onChange={e => setFormEmail(e.target.value)}
              className="flex-1 border border-indigo-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button
              onClick={handleAddAgent}
              disabled={formSubmitting || !formName.trim() || !formEmail.trim()}
              className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {formSubmitting ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-indigo-700">
            Default access: <strong>Transactions</strong> (view, complete, cancel). Additional permissions granted below.
          </p>
        </div>
      )}

      {/* ── Info Box ── */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-5">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> About Agents
        </h3>
        <ul className="space-y-1.5 text-xs text-blue-800">
          <li>• <strong>Default Access:</strong> Agents can view and manage transactions (complete, cancel, request info).</li>
          <li>• <strong>Permission System:</strong> Agents must request additional permissions for other admin features.</li>
          <li>• <strong>Agent Dashboard:</strong> Agents see "Admin Dashboard" link in navbar like admins do.</li>
          <li>• <strong>Restricted Access:</strong> Without permission, agents see "Request Permission" on restricted pages.</li>
        </ul>
      </div>

      {/* ── Pending Requests ── */}
      {pendingRequests.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-5">
          <h3 className="text-sm font-semibold text-amber-900 mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Pending Permission Requests
            <span className="ml-2 bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
          </h3>
          <div className="space-y-3">
            {pendingRequests.map(req => {
              const agent = agents.find(a => a.id === req.agentId)
              const permLabel = ALL_PERMISSIONS.find(p => p.key === req.permission)?.label || req.permission
              const isLoading = actionLoading === req.id
              return (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-lg border border-amber-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{req.agentName}</p>
                    <p className="text-xs text-gray-500">{req.agentEmail}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Requesting: <strong>{permLabel}</strong> · {formatDate(req.requestedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={isLoading}
                      onClick={() => handleResolve(req.id, 'approved', req.agentId, req.permission, agent?.permissions || [])}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />{isLoading ? 'Processing…' : 'Approve'}
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleResolve(req.id, 'denied', req.agentId, req.permission, agent?.permissions || [])}
                      className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />{isLoading ? 'Processing…' : 'Deny'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Full Editor Modal ── */}
      {editingAgent && (() => {
        const agent = agents.find(a => a.id === editingAgent)!
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => !savingPerms && setEditingAgent(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">Edit Permissions</h3>
                  <p className="text-xs text-gray-500 mt-1">{agent.name} · {agent.email}</p>
                </div>
                <button onClick={() => setEditingAgent(null)} className="text-gray-400 hover:text-gray-700 text-2xl">✕</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {ALL_PERMISSIONS.map(perm => {
                  const checked = editPerms.includes(perm.key)
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                        checked ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerm(perm.key)}
                        className="mt-1 w-4 h-4 accent-indigo-600"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                          {perm.icon} {perm.label}
                          {perm.default && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Default</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{perm.desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={savePerms}
                  disabled={savingPerms}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
                >
                  {savingPerms ? 'Saving…' : 'Save Permissions'}
                </button>
                <button
                  onClick={() => setEditingAgent(null)}
                  className="px-6 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Agents Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">All Agents</h2>
          <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-16 rounded-lg bg-gray-50 border border-gray-200">
            <UserCog className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-600 font-medium">No agents yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "+ Add Agent" to create your first agent account.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                monthlyOrders={monthlyCompleted[agent.id] || 0}
                onEditPermissions={() => {
                  setEditPerms(agent.permissions || ['transactions'])
                  setEditingAgent(agent.id)
                }}
                onStatusToggle={() => handleStatusToggle(agent.id, agent.status || 'active')}
                onRemovePerm={(perm: AgentPermission) => {
                  const next = (agent.permissions as AgentPermission[] || []).filter((p: AgentPermission) => p !== perm)
                  setActionLoading(agent.id)
                  updatePermissions(agent.id, next)
                    .finally(() => setActionLoading(null))
                    .catch(e => alert('Error: ' + (e as Error).message))
                }}
                onAddPerm={(perm) => {
                  const next = [...(agent.permissions || []), perm]
                  setActionLoading(agent.id)
                  updatePermissions(agent.id, next)
                    .finally(() => setActionLoading(null))
                    .catch(e => alert('Error: ' + (e as Error).message))
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── History ── */}
      {permissionRequests.filter(r => r.status !== 'pending').length > 0 && (
        <div className="rounded-lg bg-white border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Permission Request History</h3>
          <div className="divide-y divide-gray-100">
            {permissionRequests.filter(r => r.status !== 'pending').map(req => {
              const permLabel = ALL_PERMISSIONS.find(p => p.key === req.permission)?.label || req.permission
              return (
                <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{req.agentName}</p>
                    <p className="text-xs text-gray-500">{req.agentEmail}</p>
                    <p className="text-xs text-gray-600 mt-1">Requested: <strong>{permLabel}</strong></p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                      req.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {req.status === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {req.status === 'approved' ? 'Approved' : 'Denied'}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(req.resolvedAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

export default AgentManagement
