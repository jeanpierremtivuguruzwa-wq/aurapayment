import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './services/firebase'
import { ErrorBoundary } from './components/ErrorBoundary'
import AdminLayout from './components/Layout/AdminLayout'
import LiveActivity from './components/LiveActivity/LiveActivity'
import CurrencyPairs from './components/CurrencyPairs/CurrencyPairs'
import PaymentMethods from './components/PaymentMethods/PaymentMethods'
import CardholdersList from './components/Cardholders/CardholdersList'
import OrderManagement from './components/OrderManagement/OrderManagement'
import AllTransactions from './components/AllTransactions/AllTransactions'
import UserManagement from './components/UserManagement/UserManagement'
import UserDashboardView from './components/UserManagement/UserDashboardView'
import AdminProfile from './components/AdminProfile/AdminProfile'
import AgentManagement from './components/AgentManagement/AgentManagement'
import AuraChat from './components/AuraChat/AuraChat'
import AuraWallet from './components/AuraWallet/AuraWallet'
import CurrencyCardholderAssignments from './components/CurrencyAssignments/CurrencyCardholderAssignments'
import NotificationRecipients from './components/Notifications/NotificationRecipients'
import CardholderActivity from './components/Cardholders/CardholderActivity'
import UserDashboard from './components/UserDashboard/UserDashboard'

type Section = 'live' | 'pairs' | 'methods' | 'cardholders' | 'cardholder-activity' | 'orders' | 'transactions' | 'users' | 'user-dashboard' | 'profile' | 'agents' | 'currency-assignments' | 'notifications' | 'chat' | 'wallet' | 'public-dashboard'
type AuthState = 'loading' | 'admin' | 'unauthenticated' | 'unauthorized'

// The one and only authorised admin email
const ADMIN_EMAIL = 'johnpion2000@gmail.com'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('live')
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthState('unauthenticated')
        return
      }

      // Only the designated admin email is allowed in
      if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        setAuthState('unauthorized')
        return
      }

      // Ensure a Firestore profile doc exists with admin role
      try {
        const userRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userRef)
        if (!userDoc.exists() || userDoc.data()?.role !== 'admin') {
          await setDoc(userRef, {
            uid:       user.uid,
            email:     user.email,
            fullName:  user.displayName || user.email.split('@')[0] || 'Admin',
            role:      'admin',
            status:    'active',
            createdAt: serverTimestamp(),
          }, { merge: true })
        }
        setAuthState('admin')
      } catch {
        // Still grant access even if Firestore write fails — email check is the gate
        setAuthState('admin')
      }
    })
    return unsub
  }, [])

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-slate-600 font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Sign In Required</h2>
          <p className="text-slate-500 mb-6 text-sm">Please sign in to access the admin dashboard.</p>
          <a href="../signin.html" className="block bg-sky-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-sky-700 transition-colors">
            Go to Sign In
          </a>
        </div>
      </div>
    )
  }

  if (authState === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6 text-sm">You do not have permission to access the admin dashboard.</p>
          <a href="../dashboard.html" className="block bg-slate-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors">
            Go to Dashboard
          </a>
        </div>
      </div>
    )
  }

  const handleViewUserDashboard = (userId: string) => {
    setViewingUserId(userId)
    setActiveSection('user-dashboard')
  }

  const handleBackFromUserDashboard = () => {
    setViewingUserId(null)
    setActiveSection('users')
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'live': return <LiveActivity />
      case 'pairs': return <CurrencyPairs />
      case 'methods': return <PaymentMethods />
      case 'cardholders': return <CardholdersList />
      case 'orders': return <OrderManagement />
      case 'transactions': return <AllTransactions />
      case 'users': return <UserManagement onViewUserDashboard={handleViewUserDashboard} />
      case 'user-dashboard': return viewingUserId
        ? <UserDashboardView userId={viewingUserId} onBack={handleBackFromUserDashboard} />
        : null
      case 'profile': return <AdminProfile />
      case 'agents': return <AgentManagement />
      case 'currency-assignments': return <CurrencyCardholderAssignments />
      case 'notifications': return <NotificationRecipients />
      case 'cardholder-activity': return <CardholderActivity />
      case 'chat': return <AuraChat />
      case 'wallet': return <AuraWallet />
      case 'public-dashboard': return <UserDashboard />
      default: return null
    }
  }

  return (
    <AdminLayout 
      activeSection={activeSection} 
      onSectionChange={(section: string) => {
        if (section !== 'user-dashboard') setViewingUserId(null)
        setActiveSection(section as Section)
      }}
    >
      <ErrorBoundary key={activeSection}>
        {renderSection()}
      </ErrorBoundary>
    </AdminLayout>
  )
}

export default App