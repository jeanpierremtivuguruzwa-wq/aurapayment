import React from 'react'
import { useUsers } from '../../hooks/useUsers'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useAgents } from '../../hooks/useAgents'
import { UserRole } from '../../types/AppUser'

type StatusFilter = 'all' | 'active' | 'inactive' | 'suspended'
type RoleFilter   = 'all' | 'user' | 'admin' | 'agent'
type SortKey      = 'name' | 'joined' | 'orders'

const UserManagement: React.FC = () => {
  const { users, loading, error, updateStatus, updateRole } = useUsers()
  const { orders } = useRealtimeOrders()
  const { agents } = useAgents()

  const [search, setSearch]               = React.useState('')
  const [statusFilter, setStatusFilter]   = React.useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter]       = React.useState<RoleFilter>('all')
  const [sortKey, setSortKey]             = React.useState<SortKey>('joined')
  const [sortDir, setSortDir]             = React.useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [expandedUser, setExpandedUser]   = React.useState<string | null>(null)
  const [page, setPage]                   = React.useState(1)
  const PAGE_SIZE = 20

  // Orders count + total volume per user
  const userOrderStats = React.useMemo(() => {
    const map: Record<string, { count: number; volume: number; lastOrder: number }> = {}
    orders.forEach(o => {
      if (!o.userId) return
      if (!map[o.userId]) map[o.userId] = { count: 0, volume: 0, lastOrder: 0 }
      map[o.userId].count++
      map[o.userId].volume += Number(o.sendAmount) || 0
      const ts = o.createdAt?.seconds ?? 0
      if (ts > map[o.userId].lastOrder) map[o.userId].lastOrder = ts
    })
    return map
  }, [orders])

  // Stats
  const now = React.useMemo(() => new Date(), [])
  const todayStart    = React.useMemo(() => Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000), [now])
  const monthStart    = React.useMemo(() => Math.floor(new Date(now.getFullYear(), now.getMonth(),  1).getTime() / 1000), [now])

  const stats = React.useMemo(() => ({
    total:      users.length,
    active:     users.filter(u => (u.status || 'active') === 'active').length,
    inactive:   users.filter(u => u.status === 'inactive').length,
    suspended:  users.filter(u => u.status === 'suspended').length,
    admins:     users.filter(u => u.role === 'admin').length,
    agents:     agents.length,
    newToday:   users.filter(u => (u.createdAt?.seconds ?? 0) >= todayStart).length,
    newMonth:   users.filter(u => (u.createdAt?.seconds ?? 0) >= monthStart).length,
  }), [users, todayStart, monthStart])

  // Filter + sort + search
  const filtered = React.useMemo(() => {
    let list = [...users]
    if (statusFilter !== 'all') list = list.filter(u => (u.status || 'active') === statusFilter)
    if (roleFilter !== 'all')   list = list.filter(u => (u.role   || 'user')   === roleFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.email    || '').toLowerCase().includes(q) ||
        (u.phone    || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let va = 0, vb = 0
      if (sortKey === 'joined') {
        va = a.createdAt?.seconds ?? 0
        vb = b.createdAt?.seconds ?? 0
      } else if (sortKey === 'orders') {
        va = userOrderStats[a.id]?.count ?? 0
        vb = userOrderStats[b.id]?.count ?? 0
      } else {
        const na = (a.fullName || a.email || '').toLowerCase()
        const nb = (b.fullName || b.email || '').toLowerCase()
        return sortDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na)
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [users, statusFilter, roleFilter, search, sortKey, sortDir, userOrderStats])

  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  React.useEffect(() => { setPage(1) }, [search, statusFilter, roleFilter, sortKey, sortDir])

  const handleStatusToggle = async (userId: string, current: string) => {
    const next = current === 'suspended' ? 'active' : 'suspended'
    setActionLoading(userId)
    try { await updateStatus(userId, next as any) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setActionLoading(null) }
  }

  const handleRoleChange = async (userId: string, next: UserRole) => {
    if (!confirm(`Change this user's role to "${next}"?`)) return
    setActionLoading(userId + '_role')
    try { await updateRole(userId, next) }
    catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setActionLoading(null) }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A'
    try {
      const d = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return 'N/A' }
  }

  const formatLastSeen = (seconds: number) => {
    if (!seconds) return 'Never'
    const diff = Math.floor(Date.now() / 1000) - seconds
    if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
    return formatDate({ seconds })
  }

  const getInitials = (name: string) =>
    (name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)

  const avatarColor = (id: string) => {
    const colors = [
      'from-sky-500 to-indigo-500',
      'from-emerald-500 to-teal-500',
      'from-rose-500 to-pink-500',
      'from-amber-500 to-orange-500',
      'from-violet-500 to-purple-500',
    ]
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % colors.length
    return colors[h]
  }

  if (loading) return (
    <div className="card-base p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
        </div>
        <div className="h-64 bg-slate-200 rounded" />
      </div>
    </div>
  )

  if (error) return (
    <div className="card-base p-6 bg-red-50 border border-red-200">
      <p className="text-red-700 font-semibold">⚠️ Error loading users</p>
      <p className="text-red-600 text-sm mt-1">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-4 btn-primary text-sm">Retry</button>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Header + Stats ── */}
      <div className="card-base p-6 pb-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">👤 User Management</h2>
            <p className="text-sm text-slate-500 mt-0.5">All registered accounts · roles · status</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            <div>total accounts</div>
          </div>
        </div>

        {/* ── 8-card stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Accounts', value: stats.total,     icon: '👥', bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-800'  },
            { label: 'Active',         value: stats.active,    icon: '✅', bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-800'  },
            { label: 'Inactive',       value: stats.inactive,  icon: '😴', bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-600'  },
            { label: 'Suspended',      value: stats.suspended, icon: '🚫', bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700'    },
            { label: 'Admins',         value: stats.admins,    icon: '🛡', bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-800' },
            { label: 'Agents',         value: stats.agents,    icon: '🤝', bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-800'  },
            { label: 'New This Month', value: stats.newMonth,  icon: '📅', bg: 'bg-sky-50',     border: 'border-sky-200',    text: 'text-sky-700'    },
            { label: 'New Today',      value: stats.newToday,  icon: '🆕', bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-800'},
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg} ${s.border} flex items-center gap-3`}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <div className={`text-2xl font-bold leading-none ${s.text}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="card-base p-6">

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="text"
            placeholder="🔍  Search name, email or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as StatusFilter) }}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value as RoleFilter) }}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700"
          >
            <option value="all">All Roles</option>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
            <option value="agent">Agents</option>
          </select>
          <span className="self-center text-sm text-slate-500 whitespace-nowrap">
            {filtered.length} / {users.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-slate-500 text-lg">No users found</p>
            {users.length === 0 && (
              <p className="text-slate-400 text-sm mt-2">
                Users will appear here once they sign up through the app.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="px-4 py-3 text-left">
                      <button className="font-semibold text-slate-600 hover:text-slate-900 transition-colors" onClick={() => toggleSort('name')}>
                        User{sortIcon('name')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left">
                      <button className="font-semibold text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap" onClick={() => toggleSort('orders')}>
                        Orders{sortIcon('orders')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button className="font-semibold text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap" onClick={() => toggleSort('joined')}>
                        Joined{sortIcon('joined')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map(user => {
                    const status  = user.status || 'active'
                    const role    = user.role   || 'user'
                    const ustats  = userOrderStats[user.id] ?? userOrderStats[user.uid]
                    const orderCount  = ustats?.count  ?? 0
                    const volume      = ustats?.volume ?? 0
                    const lastOrder   = ustats?.lastOrder ?? 0
                    const isExpanded  = expandedUser === user.id
                    const isActing    = actionLoading === user.id
                    const isRoleAct   = actionLoading === user.id + '_role'

                    return (
                      <React.Fragment key={user.id}>
                        <tr
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                        >
                          {/* User */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor(user.id)} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
                                {getInitials(user.fullName || user.displayName || '')}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">
                                  {user.fullName || user.displayName || '—'}
                                </div>
                                {user.phone && (
                                  <div className="text-xs text-slate-400">{user.phone}</div>
                                )}
                              </div>
                              <span className="text-slate-400 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3.5 max-w-[200px]">
                            <span className="text-slate-600 text-sm truncate block">{user.email || '—'}</span>
                          </td>

                          {/* Role badge */}
                          <td className="px-4 py-3.5">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              role === 'admin'  ? 'bg-purple-100 text-purple-800 border-purple-200' :
                              role === 'agent'  ? 'bg-amber-100 text-amber-800 border-amber-200'   :
                                                  'bg-sky-50 text-sky-700 border-sky-200'
                            }`}>
                              {role === 'admin' ? '🛡 Admin' : role === 'agent' ? '🤝 Agent' : '👤 User'}
                            </span>
                          </td>

                          {/* Status badge */}
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              status === 'active'    ? 'bg-green-100 text-green-800 border-green-200' :
                              status === 'suspended' ? 'bg-red-100 text-red-700 border-red-200'       :
                                                       'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                status === 'active' ? 'bg-green-500 animate-pulse' :
                                status === 'suspended' ? 'bg-red-500' : 'bg-slate-400'
                              }`} />
                              {status === 'active' ? 'Active' : status === 'suspended' ? 'Suspended' : 'Inactive'}
                            </span>
                          </td>

                          {/* Orders */}
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col">
                              <span className={`text-sm font-bold ${orderCount > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {orderCount} {orderCount === 1 ? 'order' : 'orders'}
                              </span>
                              {volume > 0 && (
                                <span className="text-xs text-slate-500">
                                  {volume.toLocaleString()} sent
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Joined */}
                          <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-xs">
                            {formatDate(user.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1.5 flex-wrap items-center">
                              {status === 'suspended' ? (
                                <button
                                  disabled={isActing}
                                  onClick={() => handleStatusToggle(user.id, status)}
                                  className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                  {isActing ? '…' : '✓ Activate'}
                                </button>
                              ) : (
                                <button
                                  disabled={isActing}
                                  onClick={() => handleStatusToggle(user.id, status)}
                                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                  {isActing ? '…' : '🚫 Suspend'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded Detail Row ── */}
                        {isExpanded && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                                {/* Account info */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Info</p>
                                  <div className="text-sm space-y-1">
                                    <div><span className="text-slate-500">UID: </span><span className="font-mono text-xs text-slate-700">{user.id}</span></div>
                                    <div><span className="text-slate-500">Phone: </span><span className="text-slate-700">{user.phone || '—'}</span></div>
                                    <div><span className="text-slate-500">Display name: </span><span className="text-slate-700">{user.displayName || '—'}</span></div>
                                    <div><span className="text-slate-500">Joined: </span><span className="text-slate-700">{formatDate(user.createdAt)}</span></div>
                                  </div>
                                </div>

                                {/* Activity */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Activity</p>
                                  <div className="text-sm space-y-1">
                                    <div><span className="text-slate-500">Total orders: </span><span className="font-semibold text-emerald-700">{orderCount}</span></div>
                                    <div><span className="text-slate-500">Total volume: </span><span className="font-semibold text-slate-700">{volume > 0 ? volume.toLocaleString() : '0'}</span></div>
                                    <div><span className="text-slate-500">Last order: </span><span className="text-slate-700">{lastOrder ? formatLastSeen(lastOrder) : 'Never'}</span></div>
                                  </div>
                                </div>

                                {/* Role management */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Change Role</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {(['user', 'agent', 'admin'] as UserRole[]).map(r => (
                                      <button
                                        key={r}
                                        disabled={isRoleAct || role === r}
                                        onClick={() => handleRoleChange(user.id, r)}
                                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                                          role === r
                                            ? 'bg-slate-200 text-slate-600 border-slate-300 cursor-default'
                                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        {isRoleAct && role !== r ? '…' : (
                                          r === 'admin' ? '🛡 Admin' : r === 'agent' ? '🤝 Agent' : '👤 User'
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                  <p className="text-xs text-slate-400">Current: <strong>{role}</strong></p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages} · {filtered.length} users
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default UserManagement
