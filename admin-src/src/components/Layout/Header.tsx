import React from 'react'
import { auth } from '../../services/firebase'
import { signOut } from 'firebase/auth'
import { Users, ExternalLink } from 'lucide-react'

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
      <div className="flex items-center gap-3">
        <a
          href="/dashboard.html?preview=1"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Users size={16} strokeWidth={1.75} />
          User Dashboard
          <ExternalLink size={13} strokeWidth={2} className="opacity-60" />
        </a>
        <button onClick={handleSignOut} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200">
          Sign Out
        </button>
      </div>
    </header>
  )
}

export default Header