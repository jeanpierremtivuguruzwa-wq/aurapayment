import React from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface Props {
  children: React.ReactNode
  activeSection: string
  onSectionChange: (section: string) => void
}

const AdminLayout: React.FC<Props> = ({ children, activeSection, onSectionChange }) => {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
      <Sidebar activeSection={activeSection} onSectionChange={onSectionChange} />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout