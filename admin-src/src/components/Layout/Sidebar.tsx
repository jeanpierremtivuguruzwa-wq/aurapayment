import React from 'react'

interface Props {
  activeSection: string
  onSectionChange: (section: string) => void
}

const Sidebar: React.FC<Props> = ({ activeSection, onSectionChange }) => {
  const navItems = [
    { id: 'live', label: 'Live Activity', icon: '📋' },
    { id: 'pairs', label: 'Currency Pairs', icon: '💱' },
    { id: 'methods', label: 'Payment Methods', icon: '💳' },
    { id: 'cardholders', label: 'Cardholders', icon: '👥' },
    { id: 'cardholder-activity', label: 'Cardholder Activity', icon: '📈' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'transactions', label: 'All Transactions', icon: '📊' },
    { id: 'users',    label: 'User Management',   icon: '👤' },
    { id: 'agents',   label: 'Agent Management',  icon: '🕵️' },
    { id: 'chat',     label: 'AuraChat',           icon: '💬' },
    { id: 'wallet',   label: 'AuraWallet',          icon: '💰' },
    { id: 'currency-assignments', label: 'Currency Assignments', icon: '🏦' },
    { id: 'notifications', label: 'Notifications',       icon: '🔔' },
    { id: 'profile',  label: 'My Profile',         icon: '🛡' },
  ]

  return (
    <aside className="bg-gradient-to-b from-slate-900 to-slate-800 text-white w-full md:w-64 md:min-h-screen p-6 border-r border-slate-700 flex flex-col">
      <div className="mb-8">
        <div className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">Aura</div>
        <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-wide">Admin Dashboard</p>
      </div>
      <nav className="space-y-1 flex-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-3 ${
              activeSection === item.id 
                ? 'bg-sky-600 text-white shadow-lg' 
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="pt-6 border-t border-slate-700">
        <p className="text-xs text-slate-400 text-center">© 2026 Aura Payment</p>
      </div>
    </aside>
  )
}

export default Sidebar