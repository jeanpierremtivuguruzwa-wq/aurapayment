import React, { useEffect, useState, useMemo } from 'react'
import {
  collection, onSnapshot, orderBy, query, limit, Timestamp,
  doc, setDoc, getDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import {
  Star, Users, History, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, Pencil, Check, RefreshCw,
  ShieldCheck, AlertTriangle, Gift, Settings, Eye, Sliders,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BarsWallet {
  userId: string
  userEmail: string
  userName: string
  currency: string          // e.g. "RUB"
  balance: number           // current bars outstanding
  lifetimeEarned: number    // total ever earned (never decreases)
  frozen: number            // frozen/pending bars (not spendable)
  updatedAt: Timestamp | null
}

interface BarsHistoryEntry {
  id: string
  userId: string
  currency: string
  delta: number             // positive = earned, negative = spent/deducted
  reason: string            // e.g. "Transfer cashback (RUB)"
  description: string       // human-readable
  refId?: string            // orderId or transactionId
  balanceAfter?: number
  createdAt: Timestamp | null
}

interface BarsSettings {
  cashbackRate: number        // e.g. 0.02 = 2%
  minOrderForCashback: number // minimum order send amount
  maxCashbackPerOrder: number // cap per order
  barsName: string            // e.g. "Ikamba Bars"
  barsSymbol: string          // e.g. "bars"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: BarsSettings = {
  cashbackRate: 0.02,
  minOrderForCashback: 0,
  maxCashbackPerOrder: 500,
  barsName: 'Aura Bars',
  barsSymbol: 'bars',
}

const fmtDate = (ts: Timestamp | null): string => {
  if (!ts) return '—'
  try {
    return ts.toDate().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

const fmtBars = (n: number, symbol: string) =>
  `${Math.round(n).toLocaleString()} ${symbol}`

// ── Edit Wallet Modal ─────────────────────────────────────────────────────────

function EditWalletModal({
  wallet,
  settings,
  onClose,
}: {
  wallet: BarsWallet
  settings: BarsSettings
  onClose: () => void
}) {
  const [balance, setBalance] = useState(wallet.balance.toString())
  const [frozen, setFrozen] = useState(wallet.frozen.toString())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    const newBalance = parseFloat(balance)
    const newFrozen  = parseFloat(frozen)
    if (isNaN(newBalance) || isNaN(newFrozen)) { setError('Enter valid numbers.'); return }
    if (!reason.trim()) { setError('A reason note is required for audit trail.'); return }
    setSaving(true)
    try {
      const batch = writeBatch(db)
      const walletRef = doc(db, 'barsWallets', `${wallet.userId}_${wallet.currency}`)
      batch.set(walletRef, {
        balance: newBalance,
        frozen:  newFrozen,
        updatedAt: Timestamp.now(),
      }, { merge: true })

      // Log adjustment to history
      const histRef = doc(collection(db, 'barsHistory'))
      batch.set(histRef, {
        userId:      wallet.userId,
        currency:    wallet.currency,
        delta:       newBalance - wallet.balance,
        reason:      'Manual adjustment',
        description: reason.trim(),
        balanceAfter: newBalance,
        createdAt:   Timestamp.now(),
      })

      await batch.commit()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" /> Adjust Bars
            </h3>
            <p className="text-xs text-gray-500 mt-1">{wallet.userName} · {wallet.currency}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Balance ({settings.barsSymbol})
            </label>
            <input
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Current: <span className="font-medium text-gray-600">{fmtBars(wallet.balance, settings.barsSymbol)}</span>
              {parseFloat(balance) !== wallet.balance && !isNaN(parseFloat(balance)) && (
                <span className={`ml-2 font-semibold ${parseFloat(balance) > wallet.balance ? 'text-emerald-600' : 'text-red-500'}`}>
                  {parseFloat(balance) > wallet.balance ? '+' : ''}{Math.round(parseFloat(balance) - wallet.balance)} {settings.barsSymbol}
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Frozen ({settings.barsSymbol})
            </label>
            <input
              type="number"
              value={frozen}
              onChange={e => setFrozen(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Reason / Note <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Manual correction, bonus award…"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({
  settings,
  onClose,
}: {
  settings: BarsSettings
  onClose: () => void
}) {
  const [rate, setRate]     = useState((settings.cashbackRate * 100).toString())
  const [minAmt, setMinAmt] = useState(settings.minOrderForCashback.toString())
  const [maxCap, setMaxCap] = useState(settings.maxCashbackPerOrder.toString())
  const [name, setName]     = useState(settings.barsName)
  const [symbol, setSymbol] = useState(settings.barsSymbol)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [saved, setSaved]   = useState(false)

  const handleSave = async () => {
    const parsedRate = parseFloat(rate) / 100
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 1) { setError('Rate must be 0–100%.'); return }
    if (!name.trim() || !symbol.trim()) { setError('Name and symbol are required.'); return }
    setSaving(true)
    try {
      await setDoc(doc(db, 'barsSettings', 'main'), {
        cashbackRate:        parsedRate,
        minOrderForCashback: parseFloat(minAmt) || 0,
        maxCashbackPerOrder: parseFloat(maxCap) || 500,
        barsName:   name.trim(),
        barsSymbol: symbol.trim(),
        updatedAt:  Timestamp.now(),
      }, { merge: true })
      setSaved(true)
      setTimeout(onClose, 800)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" /> Bars Settings
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bars Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ikamba Bars" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Symbol / Unit</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="bars" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cashback Rate (%)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} step="0.1" min="0" max="100"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="2" />
            <p className="text-xs text-gray-400 mt-1">e.g. "2" = 2% of send amount awarded as bars</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Min Order Amount</label>
              <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max Bars / Order</label>
              <input type="number" value={maxCap} onChange={e => setMaxCap(e.target.value)} min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 font-medium">✓ Settings saved!</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button onClick={onClose} className="px-5 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── User Wallet Row ───────────────────────────────────────────────────────────

function WalletRow({
  wallet,
  history,
  settings,
  isAdmin,
  onAdjust,
}: {
  wallet: BarsWallet
  history: BarsHistoryEntry[]
  settings: BarsSettings
  isAdmin: boolean
  onAdjust: () => void
}) {
  const [open, setOpen] = useState(false)
  const userHistory = history
    .filter(h => h.userId === wallet.userId && h.currency === wallet.currency)
    .slice(0, 10)

  const initial = (wallet.userName || wallet.userEmail || '?').charAt(0).toUpperCase()

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
          {initial}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{wallet.userName || 'Unknown'}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
              {wallet.currency}
            </span>
            {wallet.frozen > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium border border-orange-100 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {Math.round(wallet.frozen)} frozen
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">{wallet.userEmail}</p>
        </div>

        {/* Balance info */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-lg font-bold text-blue-700">{fmtBars(wallet.balance, settings.barsSymbol)}</p>
            <p className="text-[11px] text-slate-400">Earned: {Math.round(wallet.lifetimeEarned).toLocaleString()}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button onClick={onAdjust}
                className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                title="Adjust bars">
                <Sliders className="w-4 h-4" />
              </button>
            )}
            {userHistory.length > 0 && (
              <button onClick={() => setOpen(v => !v)}
                className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
                title="Toggle history">
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transaction history */}
      {open && userHistory.length > 0 && (
        <div className="border-t border-slate-100">
          <div className="px-5 py-2 bg-slate-50">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Recent Activity</span>
          </div>
          <div className="divide-y divide-slate-50">
            {userHistory.map(entry => {
              const isCredit = entry.delta > 0
              return (
                <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCredit ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {isCredit
                      ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                      : <ArrowUpRight  className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{entry.description || entry.reason}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(entry.createdAt)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isCredit ? '+' : ''}{Math.round(entry.delta)} {settings.barsSymbol}
                    </p>
                    {entry.balanceAfter !== undefined && (
                      <p className="text-[10px] text-slate-400">bal: {Math.round(entry.balanceAfter)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const AuraBars: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const [wallets, setWallets]   = useState<BarsWallet[]>([])
  const [history, setHistory]   = useState<BarsHistoryEntry[]>([])
  const [settings, setSettings] = useState<BarsSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading]   = useState(true)

  const [search, setSearch]           = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('all')
  const [activeTab, setActiveTab]     = useState<'wallets' | 'history' | 'settings'>('wallets')

  const [editingWallet, setEditingWallet]   = useState<BarsWallet | null>(null)
  const [showSettings, setShowSettings]     = useState(false)

  // Load settings
  useEffect(() => {
    getDoc(doc(db, 'barsSettings', 'main')).then(snap => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...snap.data() } as BarsSettings)
    }).catch(() => {})
  }, [])

  // Live wallets
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'barsWallets'), snap => {
      setWallets(snap.docs.map(d => ({ ...d.data() } as BarsWallet)))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // Live history (last 200)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'barsHistory'), orderBy('createdAt', 'desc'), limit(200)),
      snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as BarsHistoryEntry))),
      () => {}
    )
    return unsub
  }, [])

  // Derived stats
  const stats = useMemo(() => {
    const totalUsers     = new Set(wallets.map(w => w.userId)).size
    const activeWallets  = wallets.filter(w => w.balance > 0).length
    const totalOutstanding = wallets.reduce((s, w) => s + w.balance, 0)
    const lifetimeTotal  = wallets.reduce((s, w) => s + w.lifetimeEarned, 0)
    return { totalUsers, activeWallets, totalOutstanding, lifetimeTotal }
  }, [wallets])

  // Per-currency summary
  const currencySummary = useMemo(() => {
    const map: Record<string, { outstanding: number; earned: number }> = {}
    for (const w of wallets) {
      if (!map[w.currency]) map[w.currency] = { outstanding: 0, earned: 0 }
      map[w.currency].outstanding += w.balance
      map[w.currency].earned      += w.lifetimeEarned
    }
    return map
  }, [wallets])

  const currencies = Object.keys(currencySummary).sort()

  // Filtered wallets
  const filtered = useMemo(() => {
    let list = [...wallets]
    if (currencyFilter !== 'all') list = list.filter(w => w.currency === currencyFilter)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(w =>
        w.userName?.toLowerCase().includes(s) ||
        w.userEmail?.toLowerCase().includes(s) ||
        w.userId?.toLowerCase().includes(s) ||
        w.currency?.toLowerCase().includes(s)
      )
    }
    return list.sort((a, b) => b.balance - a.balance)
  }, [wallets, search, currencyFilter])

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-7 text-white shadow-lg">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="w-6 h-6 text-yellow-300" /> {settings.barsName}
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              Manage the loyalty discount system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {isAdmin && (
              <button onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium transition-colors">
                <Settings className="w-3.5 h-3.5" /> Fix NaN
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Users',           value: stats.totalUsers.toString(),                         },
            { label: 'Active Wallets',         value: stats.activeWallets.toString(),                     },
            { label: 'Total Outstanding (All)',value: `${Math.round(stats.totalOutstanding).toLocaleString()} ${settings.barsSymbol}` },
            { label: 'Lifetime Earned (All)',  value: `${Math.round(stats.lifetimeTotal).toLocaleString()} ${settings.barsSymbol}` },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-xl px-4 py-3 border border-white/15">
              <p className="text-[11px] text-blue-200 font-medium uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold text-white mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Per-currency mini breakdown */}
        {currencies.length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-3">
            {currencies.map(c => (
              <div key={c} className="bg-white/10 rounded-xl px-4 py-2.5 border border-white/15 min-w-[140px]">
                <p className="text-xs font-bold text-white">{c}</p>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  Outstanding: <strong className="text-white">{Math.round(currencySummary[c].outstanding).toLocaleString()}</strong>
                </p>
                <p className="text-[11px] text-blue-200">
                  Earned: <strong className="text-white">{Math.round(currencySummary[c].earned).toLocaleString()}</strong>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cashback rate info ── */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
        <p className="text-xs font-semibold text-blue-900 mb-1 flex items-center gap-2">
          <Gift className="w-4 h-4" /> How {settings.barsName} work
        </p>
        <p className="text-xs text-blue-800">
          Every completed transfer awards <strong>{(settings.cashbackRate * 100).toFixed(2)}% cashback</strong> of the send amount as {settings.barsSymbol}.
          {settings.maxCashbackPerOrder > 0 && ` Max ${settings.maxCashbackPerOrder} ${settings.barsSymbol} per order.`}
          {' '}Users can redeem {settings.barsSymbol} for discounts on future transfers.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['wallets', 'history', 'settings'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab === 'wallets'  && <Users   className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === 'history'  && <History className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === 'settings' && <Sliders className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === 'wallets' ? `Wallets` : tab === 'history' ? 'History' : 'Settings'}
          </button>
        ))}
      </div>

      {/* ── Wallets Tab ── */}
      {activeTab === 'wallets' && (
        <div className="space-y-4">
          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, user ID, or currency..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
              <Eye className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="all">All currencies</option>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <p className="text-xs text-slate-400">{filtered.length} of {wallets.length} wallets</p>

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Loading wallets…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
              <Star className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 font-medium">No wallets found</p>
              <p className="text-slate-400 text-sm mt-1">Wallets are created automatically when users earn their first bars.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(w => (
                <WalletRow
                  key={`${w.userId}_${w.currency}`}
                  wallet={w}
                  history={history}
                  settings={settings}
                  isAdmin={isAdmin}
                  onAdjust={() => setEditingWallet(w)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Last {history.length} events (newest first)</p>
          {history.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200">
              <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">No history yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
              {history.map(entry => {
                const isCredit = entry.delta > 0
                return (
                  <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isCredit ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      {isCredit
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                        : <ArrowUpRight  className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{entry.description || entry.reason}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {entry.currency} · {fmtDate(entry.createdAt)}
                        {entry.refId && <span className="ml-2 text-blue-400">ref: {entry.refId.slice(0, 8)}…</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isCredit ? '+' : ''}{Math.round(entry.delta)} {settings.barsSymbol}
                      </p>
                      {entry.balanceAfter !== undefined && (
                        <p className="text-[10px] text-slate-400">bal: {Math.round(entry.balanceAfter)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && (
        <div className="max-w-md space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" /> Current Configuration
            </h3>
            {[
              { label: 'Program Name',     value: settings.barsName },
              { label: 'Unit Symbol',      value: settings.barsSymbol },
              { label: 'Cashback Rate',    value: `${(settings.cashbackRate * 100).toFixed(2)}%` },
              { label: 'Min Order Amount', value: settings.minOrderForCashback.toString() },
              { label: 'Max Bars / Order', value: settings.maxCashbackPerOrder.toString() },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className="text-sm font-semibold text-slate-800">{row.value}</span>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
              <Pencil className="w-4 h-4" /> Edit Settings
            </button>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {editingWallet && (
        <EditWalletModal
          wallet={editingWallet}
          settings={settings}
          onClose={() => setEditingWallet(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => { setShowSettings(false); window.location.reload() }}
        />
      )}
    </div>
  )
}

export default AuraBars
