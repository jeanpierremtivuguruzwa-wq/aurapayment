import React from 'react'
import { auth } from '../../services/firebase'
import { signOut } from 'firebase/auth'

const Header: React.FC = () => {
  const handleSignOut = async () => {
    await signOut(auth)
    window.location.href = '/signin.html'
  }
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-cyan-600 bg-clip-text text-transparent">Aura Admin</h1>
        <p className="text-sm text-slate-500 mt-1">Payment Management Dashboard</p>
      </div>
      <button onClick={handleSignOut} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200">
        Sign Out
      </button>
    </header>
  )
}

export default Header