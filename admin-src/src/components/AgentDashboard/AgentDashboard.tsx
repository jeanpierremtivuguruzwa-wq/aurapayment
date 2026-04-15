import React, { useState } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import AgentSidebar from './AgentSidebar'
import Header from '../Layout/Header'
import RequestPermission from './RequestPermission'
import LiveActivity from '../LiveActivity/LiveActivity'
import AllTransactions from '../AllTransactions/AllTransactions'
import OrderManagement from '../OrderManagement/OrderManagement'
import UserManagement from '../UserManagement/UserManagement'
import UserDashboardView from '../UserManagement/UserDashboardView'
import CurrencyPairs from '../CurrencyPairs/CurrencyPairs'
import PaymentMethods from '../PaymentMethods/PaymentMethods'
import CardholdersList from '../Cardholders/CardholdersList'
import CardholderActivity from '../Cardholders/CardholderActivity'
import AuraChat from '../AuraChat/AuraChat'
import AuraWallet from '../AuraWallet/AuraWallet'
import CurrencyCardholderAssignments from '../CurrencyAssignments/CurrencyCardholderAssignments'
import NotificationRecipients from '../Notifications/NotificationRecipients'
import AgentProfile from './AgentProfile'
import { Agent, AgentPermission } from '../../types/Agent'

type AgentSection =
  | 'transactions'
  | 'live'
  | 'orders'
  | 'users'
  | 'user-dashboard'
  | 'pairs'
  | 'methods'
  | 'cardholders'
  | 'cardholder-activity'
  | 'chat'
  | 'wallet'
  | 'currency-assignments'
  | 'notifications'
  | 'profile'

/** Maps a section to its required permission (null = always allowed) */
const SECTION_PERMISSION: Record<AgentSection, AgentPermission | null> = {
  transactions:          null,
  live:                  null,
  orders:                'orders',
  users:                 'users',
  'user-dashboard':      'users',
  pairs:                 'currency',
  methods:               'payments',
  cardholders:           'cardholders',
  'cardholder-activity': 'cardholder-activity',
  chat:                  'chat',
  wallet:                'wallet',
  'currency-assignments':'currency-assignments',
  notifications:         'notifications',
  profile:               null,
}

interface Props {
  agent: Agent
  requestPermission: (permission: AgentPermission) => Promise<void>
  getPermissionRequestStatus: (permission: AgentPermission) => 'none' | 'pending' | 'approved' | 'denied'
}

const AgentDashboard: React.FC<Props> = ({ agent, requestPermission, getPermissionRequestStatus }) => {
  const [activeSection, setActiveSection] = useState<AgentSection>('transactions')
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)

  const handleSectionChange = (section: string) => {
    if (section !== 'user-dashboard') setViewingUserId(null)
    setActiveSection(section as AgentSection)
  }

  const canAccess = (section: AgentSection): boolean => {
    const requiredPerm = SECTION_PERMISSION[section]
    if (requiredPerm === null) return true
    return agent.permissions.includes(requiredPerm)
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
    if (!canAccess(activeSection)) {
      const requiredPerm = SECTION_PERMISSION[activeSection]!
      return (
        <RequestPermission
          permission={requiredPerm}
          requestStatus={getPermissionRequestStatus(requiredPerm)}
          onRequest={() => requestPermission(requiredPerm)}
        />
      )
    }

    switch (activeSection) {
      case 'transactions':
        return <AllTransactions />
      case 'live':
        return <LiveActivity />
      case 'orders':
        return <OrderManagement />
      case 'users':
        return <UserManagement onViewUserDashboard={handleViewUserDashboard} />
      case 'user-dashboard':
        return viewingUserId
          ? <UserDashboardView userId={viewingUserId} onBack={handleBackFromUserDashboard} />
          : null
      case 'pairs':
        return <CurrencyPairs />
      case 'methods':
        return <PaymentMethods />
      case 'cardholders':
        return <CardholdersList />
      case 'cardholder-activity':
        return <CardholderActivity />
      case 'chat':
        return <AuraChat viewerAgent={agent} />
      case 'wallet':
        return <AuraWallet />
      case 'currency-assignments':
        return <CurrencyCardholderAssignments />
      case 'notifications':
        return <NotificationRecipients />
      case 'profile':
        return <AgentProfile agent={agent} />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
      <AgentSidebar
        agent={agent}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl">
            <ErrorBoundary key={activeSection}>
              {renderSection()}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

export default AgentDashboard
