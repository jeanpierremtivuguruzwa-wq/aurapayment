import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, addDoc, onSnapshot, Timestamp } from 'firebase/firestore'
import { auth, db } from './services/firebase'
import { Agent, AgentPermission, PermissionRequest } from './types/Agent'
import { ErrorBoundary } from './components/ErrorBoundary'
import AdminLayout from './components/Layout/AdminLayout'
import AgentDashboard from './components/AgentDashboard/AgentDashboard'
import AdminDashboard from './components/AdminDashboard/AdminDashboard'
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
import AppSettings from './components/AppSettings/AppSettings'
import DeliveryOptions from './components/DeliveryOptions/DeliveryOptions'
import SupportManagement from './components/SupportManagement/SupportManagement'
import EmailSettings from './components/EmailSettings/EmailSettings'
import { LanguageProvider } from './context/LanguageContext'

type Section = 'live' | 'pairs' | 'methods' | 'cardholders' | 'cardholder-activity' | 'orders' | 'transactions' | 'users' | 'user-dashboard' | 'profile' | 'agents' | 'currency-assignments' | 'notifications' | 'chat' | 'wallet' | 'public-dashboard' | 'settings' | 'delivery-options' | 'support' | 'email'
type AuthState = 'loading' | 'admin' | 'agent' | 'unauthenticated' | 'unauthorized'

// The primary admin email — always has admin access
const ADMIN_EMAIL = 'johnpion2000@gmail.com'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('live')
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)
  const [agentData, setAgentData] = useState<Agent | null>(null)
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])

  useEffect(() => {
    let reqUnsub: (() => void) | undefined

    const unsub = onAuthStateChanged(auth, async (user) => {
      // Clean up any previous permission-request listener
      if (reqUnsub) { reqUnsub(); reqUnsub = undefined }

      if (!user) {
        setAuthState('unauthenticated')
        return
      }

      // Check if user is the designated admin (by email)
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
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
        } catch { /* not critical */ }
        setAuthState('admin')
        return
      }

      // Also check if this user has been granted admin role in Firestore
      try {
        const userRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userRef)
        if (userDoc.exists() && userDoc.data()?.role === 'admin') {
          setAuthState('admin')
          return
        }
      } catch { /* not critical */ }

      // Not admin — check if user is a registered agent
      try {
        const agentSnap = await getDocs(
          query(collection(db, 'agents'), where('email', '==', user.email!.toLowerCase()))
        )
        if (!agentSnap.empty) {
          const agentDoc = agentSnap.docs[0]
          const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent
          setAgentData(agent)
          setAuthState('agent')

          // Ensure users/{uid} has role='agent' so Firestore rules grant access
          try {
            await setDoc(doc(db, 'users', user.uid), { role: 'agent' }, { merge: true })
          } catch { /* not critical */ }

          // Subscribe to this agent's permission requests in real time
          reqUnsub = onSnapshot(
            query(collection(db, 'permissionRequests'), where('agentId', '==', agent.id)),
            (snap) => {
              const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as PermissionRequest[]
              setPermissionRequests(reqs)
            }
          )
        } else {
          setAuthState('unauthorized')
        }
      } catch {
        setAuthState('unauthorized')
      }
    })

    return () => { unsub(); if (reqUnsub) reqUnsub() }
  }, [])

  const requestPermission = useCallback(async (permission: AgentPermission) => {
    if (!agentData) return
    const existing = permissionRequests.find(r => r.permission === permission && r.status === 'pending')
    if (existing) return
    await addDoc(collection(db, 'permissionRequests'), {
      agentId:    agentData.id,
      agentName:  agentData.name,
      agentEmail: agentData.email,
      permission,
      status:     'pending',
      requestedAt: Timestamp.now(),
    })
  }, [agentData, permissionRequests])

  const getPermissionRequestStatus = useCallback((permission: AgentPermission): 'none' | 'pending' | 'approved' | 'denied' => {
    const req = permissionRequests
      .filter(r => r.permission === permission)
      .sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0))[0]
    return req ? req.status : 'none'
  }, [permissionRequests])

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

  // Agent users get their own dashboard view
  if (authState === 'agent' && agentData) {
    return (
      <AgentDashboard
        agent={agentData}
        requestPermission={requestPermission}
        getPermissionRequestStatus={getPermissionRequestStatus}
      />
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
      case 'live': return <AdminDashboard />
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
      case 'settings': return <AppSettings />
      case 'delivery-options': return <DeliveryOptions />
      case 'support': return <SupportManagement />
      case 'email': return <EmailSettings />
      default: return null
    }
  }

  return (
    <LanguageProvider>
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
    </LanguageProvider>
  )
}

export default App