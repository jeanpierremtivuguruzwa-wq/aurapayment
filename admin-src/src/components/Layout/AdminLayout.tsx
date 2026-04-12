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
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar activeSection={activeSection} onSectionChange={onSectionChange} />
      <div className="flex-1">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}

export default AdminLayout