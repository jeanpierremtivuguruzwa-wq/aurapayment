import React, { useState } from 'react'
import { AgentPermission } from '../../types/Agent'
import {
  BarChart2, Package, Users, ArrowLeftRight, CreditCard, UserCheck,
  TrendingUp, MessageCircle, Wallet, Landmark, Bell, Headphones,
  Clock, XCircle, Lock, Send,
} from 'lucide-react'

const PERMISSION_META: Record<AgentPermission, { label: string; icon: React.ReactNode; desc: string }> = {
  transactions:          { label: 'Transactions',         icon: <BarChart2 className="w-8 h-8" />,       desc: 'View and manage all payment transactions' },
  orders:                { label: 'Orders',               icon: <Package className="w-8 h-8" />,         desc: 'View, complete and cancel customer orders' },
  users:                 { label: 'User Management',      icon: <Users className="w-8 h-8" />,           desc: 'View registered users and their details' },
  currency:              { label: 'Currency Pairs',       icon: <ArrowLeftRight className="w-8 h-8" />,  desc: 'View and edit currency exchange rates' },
  payments:              { label: 'Payment Methods',      icon: <CreditCard className="w-8 h-8" />,      desc: 'View and manage payment methods' },
  cardholders:           { label: 'Cardholders',          icon: <UserCheck className="w-8 h-8" />,       desc: 'View and manage cardholder records' },
  'cardholder-activity': { label: 'Cardholder Activity',  icon: <TrendingUp className="w-8 h-8" />,      desc: 'View cardholder transaction activity history' },
  chat:                  { label: 'AuraChat',             icon: <MessageCircle className="w-8 h-8" />,   desc: 'Access the internal Aura chat system' },
  wallet:                { label: 'AuraWallet',           icon: <Wallet className="w-8 h-8" />,          desc: 'View and manage Aura wallet records' },
  'currency-assignments':{ label: 'Currency Assignments', icon: <Landmark className="w-8 h-8" />,        desc: 'Manage cardholder currency assignments' },
  notifications:         { label: 'Notifications',        icon: <Bell className="w-8 h-8" />,            desc: 'Manage notification recipients and alerts' },
  support:               { label: 'User Support',         icon: <Headphones className="w-8 h-8" />,      desc: 'Answer user support tickets and chat' },
}

interface Props {
  permission: AgentPermission
  requestStatus: 'none' | 'pending' | 'approved' | 'denied'
  onRequest: () => Promise<void>
}

const RequestPermission: React.FC<Props> = ({ permission, requestStatus, onRequest }) => {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const meta = PERMISSION_META[permission]

  const handleRequest = async () => {
    setSending(true)
    try {
      await onRequest()
      setSent(true)
    } catch {
      /* ignore */
    } finally {
      setSending(false)
    }
  }

  const isPending = requestStatus === 'pending' || sent
  const isDenied = requestStatus === 'denied' && !sent

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5 text-slate-500">
          {meta.icon}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{meta.label}</h2>
        <p className="text-slate-500 text-sm mb-6">{meta.desc}</p>

        {/* Status area */}
        {isPending ? (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-amber-600" />
              <p className="font-semibold text-amber-700">Permission Request Pending</p>
            </div>
            <p className="text-sm text-amber-600">
              Your request has been sent to the administrator. You'll gain access once it's approved.
            </p>
          </div>
        ) : isDenied ? (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="font-semibold text-red-700">Request Denied</p>
            </div>
            <p className="text-sm text-red-600">
              Your previous request was denied. You may submit a new request.
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Lock className="w-5 h-5 text-slate-500" />
              <p className="font-semibold text-slate-700">Access Restricted</p>
            </div>
            <p className="text-sm text-slate-500">
              You don't have permission to access this section. Request access from your administrator.
            </p>
          </div>
        )}

        {/* Action button */}
        {!isPending && (
          <button
            onClick={handleRequest}
            disabled={sending}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Sending Request...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {isDenied ? 'Re-request Permission' : 'Request Permission'}
              </>
            )}
          </button>
        )}

        <p className="text-xs text-slate-400 mt-4">
          Permission requests are reviewed by the administrator.
        </p>
      </div>
    </div>
  )
}

export default RequestPermission
