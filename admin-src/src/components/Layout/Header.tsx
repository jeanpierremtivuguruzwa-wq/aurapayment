import React from 'react'
import { auth } from '../../services/firebase'
import { signOut } from 'firebase/auth'

const Header: React.FC = () => {
  const handleSignOut = async () => {
    await signOut(auth)
    window.location.href = '/signin.html'
  }
  return (
    <header className="bg-white shadow p-4 flex justify-between items-center">
      <h1 className="text-xl font-bold">Aura Payment Admin</h1>
      <button onClick={handleSignOut} className="bg-red-500 text-white px-4 py-2 rounded">
        Sign Out
      </button>
    </header>
  )
}

export default Header