import React from 'react'
import {
  Home, ArrowLeftRight, CreditCard, Users, Activity, Package,
  BarChart2, User, Briefcase, MessageCircle, Wallet, Landmark,
  Bell, Truck, Globe, UserCircle, HelpCircle, Mail, Settings,
  ShieldAlert, ScanSearch, Star,
  LucideIcon,
} from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'

interface Props {
  activeSection: string
  onSectionChange: (section: string) => void
}

interface NavItem {
  id: string
  label: string
  description: string
  Icon: LucideIcon
}

const Sidebar: React.FC<Props> = ({ activeSection, onSectionChange }) => {
  const { t } = useLanguage()

  const navItems: NavItem[] = [
    { id: 'live',                 label: t('dashboard'),           description: 'Overview & live orders',     Icon: Home           },
    { id: 'pairs',                label: t('currencyPairs'),       description: 'Manage exchange rates',      Icon: ArrowLeftRight },
    { id: 'methods',              label: t('paymentMethods'),      description: 'Cards & bank accounts',      Icon: CreditCard     },
    { id: 'cardholders',          label: t('cardholders'),         description: 'Assigned cardholder list',   Icon: Users          },
    { id: 'cardholder-activity',  label: t('cardholderActivity'),  description: 'Usage & activity logs',      Icon: Activity       },
    { id: 'orders',               label: t('orders'),              description: 'All incoming orders',        Icon: Package        },
    { id: 'transactions',         label: t('allTransactions'),     description: 'Full transaction history',   Icon: BarChart2      },
    { id: 'users',                label: t('userManagement'),      description: 'Manage user accounts',       Icon: User           },
    { id: 'public-dashboard',     label: t('userDashboard'),       description: 'View all user dashboards',   Icon: Globe          },
    { id: 'agents',               label: t('agentManagement'),     description: 'Agent roles & permissions',  Icon: Briefcase      },
    { id: 'fraud-monitor',        label: 'AI Fraud Monitor',       description: 'Detect fraud & suspicious',  Icon: ShieldAlert    },
    { id: 'proof-monitor',        label: 'AI Proof Monitor',       description: 'Review payment proofs',      Icon: ScanSearch     },
    { id: 'chat',                 label: t('auraChat'),            description: 'AI-powered support chat',    Icon: MessageCircle  },
    { id: 'wallet',               label: t('auraWallet'),          description: 'Balance & wallet ops',       Icon: Wallet         },
    { id: 'bars',                 label: 'Aura Bars',              description: 'Loyalty discount system',    Icon: Star           },
    { id: 'currency-assignments', label: t('currencyAssignments'), description: 'Currency routing rules',     Icon: Landmark       },
    { id: 'notifications',        label: t('notifications'),       description: 'Alerts & messages',          Icon: Bell           },
    { id: 'delivery-options',     label: t('deliveryOptions'),     description: 'Delivery method settings',   Icon: Truck          },
    { id: 'profile',              label: t('myProfile'),           description: 'Your account & settings',   Icon: UserCircle     },
    { id: 'support',              label: 'Support',                description: 'Help & ticket management',   Icon: HelpCircle     },
    { id: 'email',                label: 'Email',                  description: 'Order email notifications',  Icon: Mail           },
    { id: 'settings',             label: t('settings'),            description: 'System configuration',       Icon: Settings       },
  ]

  const isUserDashboard = activeSection === 'user-dashboard'

  return (
    <aside className="bg-white border-r border-gray-100 w-full md:w-72 md:min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-100">
        <div className="text-xl font-bold tracking-tight text-gray-900">Aura<span className="text-sky-500">.</span></div>
        <p className="text-[11px] text-gray-400 mt-0.5 font-medium uppercase tracking-widest">Admin Console</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map(({ id, label, description, Icon }) => {
          const isActive = activeSection === id || (id === 'users' && isUserDashboard)
          return (
            <React.Fragment key={id}>
              <button
                onClick={() => onSectionChange(id)}
                className={`group w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-150 ${
                  isActive
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {/* Text block */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate leading-tight ${isActive ? 'text-sky-700' : 'text-gray-800'}`}>
                    {label}
                  </p>
                  <p className={`text-[11px] truncate mt-0.5 leading-tight ${isActive ? 'text-sky-500' : 'text-gray-400'}`}>
                    {description}
                  </p>
                </div>
                {/* Icon */}
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  className={`shrink-0 transition-colors ${isActive ? 'text-sky-500' : 'text-gray-300 group-hover:text-gray-400'}`}
                />
              </button>

              {/* User Dashboard sub-item */}
              {id === 'users' && isUserDashboard && (
                <div className="ml-4 border-l border-gray-200 pl-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">
                    <Globe size={14} strokeWidth={1.75} />
                    <span>User Dashboard</span>
                  </div>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-[11px] text-gray-400">© 2026 Aura Payment</p>
      </div>
    </aside>
  )
}

export default Sidebar
