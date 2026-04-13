import { useState } from 'react'
import AdminLayout from './components/Layout/AdminLayout'
import LiveActivity from './components/LiveActivity/LiveActivity'
import CurrencyPairs from './components/CurrencyPairs/CurrencyPairs'
import PaymentMethods from './components/PaymentMethods/PaymentMethods'
import CardholdersList from './components/Cardholders/CardholdersList'
import OrderManagement from './components/OrderManagement/OrderManagement'
import AllTransactions from './components/AllTransactions/AllTransactions'

type Section = 'live' | 'pairs' | 'methods' | 'cardholders' | 'orders' | 'transactions'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('live')

  const renderSection = () => {
    switch (activeSection) {
      case 'live': return <LiveActivity />
      case 'pairs': return <CurrencyPairs />
      case 'methods': return <PaymentMethods />
      case 'cardholders': return <CardholdersList />
      case 'orders': return <OrderManagement />
      case 'transactions': return <AllTransactions />
      default: return null
    }
  }

  return (
    <AdminLayout 
      activeSection={activeSection} 
      onSectionChange={(section: string) => setActiveSection(section as Section)}
    >
      {renderSection()}
    </AdminLayout>
  )
}

export default App