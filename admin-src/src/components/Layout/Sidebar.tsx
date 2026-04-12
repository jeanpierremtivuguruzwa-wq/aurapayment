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
  ]

  return (
    <aside className="bg-[#0b1b3a] text-white w-full md:w-64 md:min-h-screen">
      <div className="p-4 text-xl font-bold border-b border-blue-800">Aura Admin</div>
      <nav className="mt-4">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
              activeSection === item.id ? 'bg-[#1e2f4b] text-white' : 'text-gray-300 hover:bg-[#1e2f4b]'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar