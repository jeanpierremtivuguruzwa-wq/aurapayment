import { useState } from 'react'
import AdminLayout from './components/Layout/AdminLayout'
import LiveActivity from './components/LiveActivity/LiveActivity'
import CurrencyPairs from './components/CurrencyPairs/CurrencyPairs'
import PaymentMethods from './components/PaymentMethods/PaymentMethods'

type Section = 'live' | 'pairs' | 'methods'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('live')

  const renderSection = () => {
    switch (activeSection) {
      case 'live': return <LiveActivity />
      case 'pairs': return <CurrencyPairs />
      case 'methods': return <PaymentMethods />
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