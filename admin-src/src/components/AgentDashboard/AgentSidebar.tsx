import React from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../services/firebase'
import { Agent, AgentPermission } from '../../types/Agent'

interface NavItem {
  id: string
  label: string
  icon: string
  requiredPermission: AgentPermission | null // null = always accessible
}

const NAV_ITEMS: NavItem[] = [
  { id: 'transactions',        label: 'All Transactions',      icon: '📊', requiredPermission: null },
  { id: 'live',                label: 'Live Activity',         icon: '📋', requiredPermission: null },
  { id: 'orders',              label: 'Orders',                icon: '📦', requiredPermission: 'orders' },
  { id: 'users',               label: 'User Management',       icon: '👤', requiredPermission: 'users' },
  { id: 'pairs',               label: 'Currency Pairs',        icon: '💱', requiredPermission: 'currency' },
  { id: 'methods',             label: 'Payment Methods',       icon: '💳', requiredPermission: 'payments' },
  { id: 'cardholders',         label: 'Cardholders',           icon: '👥', requiredPermission: 'cardholders' },
  { id: 'cardholder-activity', label: 'Cardholder Activity',   icon: '📈', requiredPermission: 'cardholder-activity' },
  { id: 'chat',                label: 'AuraChat',              icon: '💬', requiredPermission: 'chat' },
  { id: 'wallet',              label: 'AuraWallet',            icon: '💰', requiredPermission: 'wallet' },
  { id: 'currency-assignments',label: 'Currency Assignments',  icon: '🏦', requiredPermission: 'currency-assignments' },
  { id: 'notifications',       label: 'Notifications',         icon: '🔔', requiredPermission: 'notifications' },
  { id: 'profile',             label: 'My Profile',            icon: '🛡', requiredPermission: null },
]

interface Props {
  agent: Agent
  activeSection: string
  onSectionChange: (section: string) => void
}

const AgentSidebar: React.FC<Props> = ({ agent, activeSection, onSectionChange }) => {
  const hasPermission = (item: NavItem): boolean => {
    if (item.requiredPermission === null) return true
    return agent.permissions.includes(item.requiredPermission)
  }

  const getInitials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)

  const handleSignOut = async () => {
    await signOut(auth)
    window.location.href = '/signin.html'
  }

  return (
    <aside className="bg-gradient-to-b from-slate-900 to-slate-800 text-white w-full md:w-64 md:min-h-screen p-6 border-r border-slate-700 flex flex-col">
      {/* Brand */}
      <div className="mb-8">
        <div className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">Aura</div>
        <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-wide">Admin Dashboard</p>
      </div>

      {/* Agent Profile Badge */}
      <div className="mb-6 p-3 bg-sky-900/40 border border-sky-700/50 rounded-xl flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {agent.photoURL
            ? <img src={agent.photoURL} alt={agent.name} className="w-full h-full rounded-full object-cover" />
            : getInitials(agent.name)
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
          <span className="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5 mt-0.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
            Agent
          </span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map(item => {
          const allowed = hasPermission(item)
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              title={!allowed ? `Permission required: ${item.requiredPermission}` : undefined}
              className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-3 ${
                isActive
                  ? 'bg-sky-600 text-white shadow-lg'
                  : allowed
                    ? 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    : 'text-slate-500 hover:bg-slate-800/60 cursor-pointer'
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {!allowed && (
                <span className="text-xs text-slate-500">🔒</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Sign Out */}
      <div className="pt-4 border-t border-slate-700 mt-4 space-y-3">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-4 py-2.5 rounded-lg text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors text-sm font-medium flex items-center gap-2"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
        <p className="text-xs text-slate-500 text-center">© 2026 Aura Payment</p>
      </div>
    </aside>
  )
}

export default AgentSidebar
