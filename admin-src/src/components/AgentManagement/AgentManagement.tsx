import React from 'react'
import { useAgents } from '../../hooks/useAgents'
import { AgentPermission } from '../../types/Agent'

const ALL_PERMISSIONS: { key: AgentPermission; label: string; desc: string; icon: string; default?: boolean }[] = [
  { key: 'transactions',        label: 'Transactions',          desc: 'View & manage transactions',            icon: '📊', default: true },
  { key: 'orders',              label: 'Orders',                desc: 'View, complete & cancel orders',        icon: '📦' },
  { key: 'users',               label: 'User Management',       desc: 'View registered users',                 icon: '👤' },
  { key: 'currency',            label: 'Currency Pairs',        desc: 'View & edit currency rates',            icon: '💱' },
  { key: 'payments',            label: 'Payment Methods',       desc: 'View & edit payment methods',           icon: '💳' },
  { key: 'cardholders',         label: 'Cardholders',           desc: 'View & manage cardholders',             icon: '👥' },
  { key: 'cardholder-activity', label: 'Cardholder Activity',   desc: 'View cardholder transaction activity',  icon: '📈' },
  { key: 'chat',                label: 'AuraChat',              desc: 'Access the internal chat system',       icon: '💬' },
  { key: 'wallet',              label: 'AuraWallet',            desc: 'View & manage Aura wallet records',     icon: '💰' },
  { key: 'currency-assignments',label: 'Currency Assignments',  desc: 'Manage cardholder currency assignments', icon: '🏦' },
  { key: 'notifications',       label: 'Notifications',         desc: 'Manage notification recipients',        icon: '🔔' },
]

const AgentManagement: React.FC = () => {
  const { agents, permissionRequests, loading, addAgent, updatePermissions, updateStatus, resolveRequest } = useAgents()

  // Add agent form
  const [showForm, setShowForm] = React.useState(false)
  const [formName, setFormName] = React.useState('')
  const [formEmail, setFormEmail] = React.useState('')
  const [formSubmitting, setFormSubmitting] = React.useState(false)

  // Permission editing (modal)
  const [editingAgent, setEditingAgent] = React.useState<string | null>(null)
  const [editPerms, setEditPerms] = React.useState<AgentPermission[]>([])
  const [savingPerms, setSavingPerms] = React.useState(false)

  // Inline permission editing
  const [inlineDropdown, setInlineDropdown] = React.useState<string | null>(null)
  const [inlineSaving, setInlineSaving] = React.useState<string | null>(null) // agentId being saved

  // Action loading
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!inlineDropdown) return
    const handler = () => setInlineDropdown(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [inlineDropdown])

  const inlineRemovePerm = async (agentId: string, perms: AgentPermission[], perm: AgentPermission) => {
    const next = perms.filter(p => p !== perm)
    setInlineSaving(agentId)
    try { await updatePermissions(agentId, next) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setInlineSaving(null) }
  }

  const inlineAddPerm = async (agentId: string, perms: AgentPermission[], perm: AgentPermission) => {
    const next = [...perms, perm]
    setInlineDropdown(null)
    setInlineSaving(agentId)
    try { await updatePermissions(agentId, next) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setInlineSaving(null) }
  }

  const pendingRequests = permissionRequests.filter(r => r.status === 'pending')

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A'
    try {
      const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return 'N/A' }
  }

  const getInitials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)

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
    <div className="card-base p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-48 bg-slate-200 rounded" />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="card-base p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">🕵️ Agent Management</h2>
            <p className="text-sm text-slate-500 mt-1">Assign and manage agent permissions</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white text-sm px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            {showForm ? '✕ Cancel' : '+ Add Agent'}
          </button>
        </div>

        {/* Add Agent Form */}
        {showForm && (
          <div className="mt-5 pt-5 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">New Agent</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Full Name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
              />
              <input
                type="email"
                placeholder="Email address"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
              />
              <button
                onClick={handleAddAgent}
                disabled={formSubmitting || !formName.trim() || !formEmail.trim()}
                className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {formSubmitting ? 'Adding…' : 'Add Agent'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Default access: <strong>Transactions</strong> (view, complete, cancel). Extra permissions can be granted below.
            </p>
          </div>
        )}
      </div>

      {/* ── About Agents info box ── */}
      <div className="card-base p-5 bg-sky-50 border border-sky-200">
        <h3 className="text-sm font-semibold text-sky-800 mb-2">ℹ️ About Agents</h3>
        <ul className="space-y-1.5 text-xs text-sky-700">
          <li>• <strong>Default Access:</strong> Agents can view and manage transactions (complete, cancel, request info).</li>
          <li>• <strong>Permission System:</strong> Agents must request additional permissions for other admin features.</li>
          <li>• <strong>Agent Dashboard:</strong> Agents see "Admin Dashboard" link in navbar like admins do.</li>
          <li>• <strong>Restricted Access:</strong> Without permission, agents see "Request Permission" on restricted pages.</li>
        </ul>
      </div>

      {/* ── Pending Permission Requests ── */}
      {pendingRequests.length > 0 && (
        <div className="card-base p-6 border-l-4 border-amber-400 bg-amber-50">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔔</span>
            <h3 className="font-semibold text-amber-900">Pending Permission Requests</h3>
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
          </div>
          <div className="space-y-3">
            {pendingRequests.map(req => {
              const agent = agents.find(a => a.id === req.agentId)
              const permLabel = ALL_PERMISSIONS.find(p => p.key === req.permission)?.label || req.permission
              const isLoading = actionLoading === req.id
              return (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-amber-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{req.agentName}</p>
                    <p className="text-xs text-slate-500">{req.agentEmail}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Requesting: <strong>{permLabel}</strong> access · {formatDate(req.requestedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={isLoading}
                      onClick={() => handleResolve(req.id, 'approved', req.agentId, req.permission, agent?.permissions || [])}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {isLoading ? '…' : '✓ Approve'}
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleResolve(req.id, 'denied', req.agentId, req.permission, agent?.permissions || [])}
                      className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {isLoading ? '…' : '✕ Deny'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Permission Editor Modal ── */}
      {editingAgent && (() => {
        const agent = agents.find(a => a.id === editingAgent)!
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => !savingPerms && setEditingAgent(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-slate-900">Edit Permissions</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{agent.name} · {agent.email}</p>
                </div>
                <button onClick={() => setEditingAgent(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
              </div>
              <div className="space-y-2 mb-6">
                {ALL_PERMISSIONS.map(perm => {
                  const checked = editPerms.includes(perm.key)
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                        checked ? 'bg-sky-50 border-sky-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerm(perm.key)}
                        className="w-4 h-4 accent-sky-600"
                      />
                      <span className="text-lg">{perm.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          {perm.label}
                          {perm.default && (
                            <span className="text-xs bg-slate-200 text-slate-500 px-1.5 rounded font-normal">Default</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{perm.desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={savePerms}
                  disabled={savingPerms}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
                >
                  {savingPerms ? 'Saving…' : 'Save Permissions'}
                </button>
                <button
                  onClick={() => setEditingAgent(null)}
                  className="px-4 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Agents Table ── */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800">All Agents</h3>
          <span className="text-sm text-slate-500">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-5xl mb-3">🕵️</div>
            <p className="text-slate-500 text-lg">No agents yet</p>
            <p className="text-slate-400 text-sm mt-1">Click "+ Add Agent" to create your first agent account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Agent Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Permissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">Added</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map(agent => {
                  const status = agent.status || 'active'
                  const perms = agent.permissions || ['transactions']
                  const isLoading = actionLoading === agent.id

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50 transition-colors">

                      {/* Name */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {agent.photoURL ? (
                            <img src={agent.photoURL} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                              {getInitials(agent.name)}
                            </div>
                          )}
                          <span className="font-medium text-slate-900">{agent.name}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-4 text-slate-600 text-sm">{agent.email}</td>

                      {/* Permissions — inline edit */}
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {perms.map(perm => {
                            const p = ALL_PERMISSIONS.find(x => x.key === perm)
                            const saving = inlineSaving === agent.id
                            return (
                              <span
                                key={perm}
                                className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full group"
                              >
                                {p?.icon} {p?.label || perm}
                                <button
                                  disabled={saving}
                                  onClick={() => inlineRemovePerm(agent.id, perms, perm)}
                                  className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-sky-400 hover:text-white hover:bg-red-500 transition-colors disabled:opacity-40"
                                  title={`Remove ${p?.label || perm}`}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                          {/* Add permission dropdown */}
                          {(() => {
                            const available = ALL_PERMISSIONS.filter(p => !perms.includes(p.key))
                            if (available.length === 0) return null
                            const isOpen = inlineDropdown === agent.id
                            return (
                              <div className="relative" onMouseDown={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setInlineDropdown(isOpen ? null : agent.id)}
                                  disabled={inlineSaving === agent.id}
                                  className="inline-flex items-center gap-0.5 bg-slate-100 hover:bg-sky-100 text-slate-500 hover:text-sky-700 border border-dashed border-slate-300 hover:border-sky-400 text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-40"
                                  title="Add permission"
                                >
                                  ＋ Add
                                </button>
                                {isOpen && (
                                  <div className="absolute left-0 top-7 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px]">
                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide px-3 pt-2 pb-1">Grant permission</p>
                                    {available.map(p => (
                                      <button
                                        key={p.key}
                                        onClick={() => inlineAddPerm(agent.id, perms, p.key)}
                                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-sky-50 text-slate-700 hover:text-sky-800 transition-colors"
                                      >
                                        <span>{p.icon}</span>
                                        <span className="font-medium">{p.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          {inlineSaving === agent.id && (
                            <span className="text-xs text-slate-400 italic">saving…</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          status === 'active'
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                          {status === 'active' ? '● Active' : '● Suspended'}
                        </span>
                      </td>

                      {/* Date added */}
                      <td className="px-4 py-4 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(agent.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {status === 'suspended' ? (
                            <button
                              disabled={isLoading}
                              onClick={() => handleStatusToggle(agent.id, status)}
                              className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                              {isLoading ? '…' : '✓ Activate'}
                            </button>
                          ) : (
                            <button
                              disabled={isLoading}
                              onClick={() => handleStatusToggle(agent.id, status)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                              {isLoading ? '…' : '🚫 Suspend'}
                            </button>
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

      {/* ── Resolved Requests History ── */}
      {permissionRequests.filter(r => r.status !== 'pending').length > 0 && (
        <div className="card-base p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Permission Request History</h3>
          <div className="divide-y divide-slate-100">
            {permissionRequests.filter(r => r.status !== 'pending').map(req => {
              const permLabel = ALL_PERMISSIONS.find(p => p.key === req.permission)?.label || req.permission
              return (
                <div key={req.id} className="flex items-center justify-between py-3 gap-4">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{req.agentName}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-xs text-slate-500">{req.agentEmail}</span>
                    <p className="text-xs text-slate-500 mt-0.5">Requested: <strong>{permLabel}</strong></p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                      req.status === 'approved'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-red-100 text-red-700 border-red-200'
                    }`}>
                      {req.status === 'approved' ? '✓ Approved' : '✕ Denied'}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(req.resolvedAt)}</span>
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
