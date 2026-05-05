import React, { useEffect, useMemo, useState } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { CurrencyPair } from '../../types/CurrencyPair'
import { TrendingUp, Trash2, Smartphone, DollarSign, Search, Globe, RefreshCw, Zap } from 'lucide-react'
import {
  addCurrencyPair,
  deactivateAllPairs,
  deleteCurrencyPair,
  getRateHistory,
  logRateChange,
  RateHistoryEntry,
  updateCurrencyPair,
} from '../../services/currencyService'
import {
  fetchMarketQuotes,
  crossRate,
  saveApiKey,
  loadApiKey,
  MarketQuotes,
} from '../../services/currencyLayerService'

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY PAIRS  –  CFA Franc corridors (RUB ↔ XOF / XAF)
// Layout: card per currency group, each row = sender flag → receiver flag
// ─────────────────────────────────────────────────────────────────────────────

// ── static reference data ─────────────────────────────────────────────────────

const DELIVERY_OPTIONS = ['Mobile Money', 'Bank Transfer', 'Cash Pickup', 'Crypto'] as const

const XOF_COUNTRIES = [
  { country: 'Benin',          countryCode: 'BEN', flag: '🇧🇯' },
  { country: 'Burkina Faso',   countryCode: 'BFA', flag: '🇧🇫' },
  { country: "Côte d'Ivoire",  countryCode: 'CIV', flag: '🇨🇮' },
  { country: 'Guinea-Bissau',  countryCode: 'GNB', flag: '🇬🇼' },
  { country: 'Mali',           countryCode: 'MLI', flag: '🇲🇱' },
  { country: 'Niger',          countryCode: 'NER', flag: '🇳🇪' },
  { country: 'Senegal',        countryCode: 'SEN', flag: '🇸🇳' },
  { country: 'Togo',           countryCode: 'TGO', flag: '🇹🇬' },
]

const XAF_COUNTRIES = [
  { country: 'Cameroon',             countryCode: 'CMR', flag: '🇨🇲' },
  { country: 'Central African Rep.', countryCode: 'CAF', flag: '🇨🇫' },
  { country: 'Chad',                 countryCode: 'TCD', flag: '🇹🇩' },
  { country: 'Republic of Congo',    countryCode: 'COG', flag: '🇨🇬' },
  { country: 'Equatorial Guinea',    countryCode: 'GNQ', flag: '🇬🇶' },
  { country: 'Gabon',                countryCode: 'GAB', flag: '🇬🇦' },
]


// ── expected corridor definitions (always show these, seeded or not) ──────────

type ExpectedCorridor = { from: string; to: string; country: string; countryCode: string; flag: string }

// 4 directional corridor lists (28 total)
const EXPECTED_RUB_XAF: ExpectedCorridor[] = XAF_COUNTRIES.map(c => ({
  from: 'RUB', to: 'XAF', country: c.country, countryCode: c.countryCode, flag: c.flag,
}))
const EXPECTED_RUB_XOF: ExpectedCorridor[] = XOF_COUNTRIES.map(c => ({
  from: 'RUB', to: 'XOF', country: c.country, countryCode: c.countryCode, flag: c.flag,
}))
const EXPECTED_XAF_RUB: ExpectedCorridor[] = XAF_COUNTRIES.map(c => ({
  from: 'XAF', to: 'RUB', country: c.country, countryCode: c.countryCode, flag: c.flag,
}))
const EXPECTED_XOF_RUB: ExpectedCorridor[] = XOF_COUNTRIES.map(c => ({
  from: 'XOF', to: 'RUB', country: c.country, countryCode: c.countryCode, flag: c.flag,
}))
const TOTAL_EXPECTED = EXPECTED_RUB_XAF.length + EXPECTED_RUB_XOF.length + EXPECTED_XAF_RUB.length + EXPECTED_XOF_RUB.length // 28

// ── Additional sending currencies (each gets XOF + XAF corridors) ────────────
const EXTRA_SENDING = [
  { code: 'USD',  name: 'US Dollar'     },
  { code: 'EUR',  name: 'Euro'          },
  { code: 'GBP',  name: 'British Pound' },
  { code: 'USDT', name: 'Tether (USDT)' },
  { code: 'CNY',  name: 'Chinese Yuan'  },
  { code: 'AED',  name: 'UAE Dirham'    },
]

function buildCorridors(from: string) {
  return {
    xof: XOF_COUNTRIES.map(c => ({ from, to: 'XOF', country: c.country, countryCode: c.countryCode, flag: c.flag })) as ExpectedCorridor[],
    xaf: XAF_COUNTRIES.map(c => ({ from, to: 'XAF', country: c.country, countryCode: c.countryCode, flag: c.flag })) as ExpectedCorridor[],
  }
}

/** Merge a list of expected corridors with live Firestore pairs.
 *  Returns CurrencyPair[] where unmatched corridors have id='' (placeholder). */
function mergeWithLive(expected: ExpectedCorridor[], live: CurrencyPair[]): CurrencyPair[] {
  return expected.map(e => {
    const found = live.find(
      p => p.from === e.from && p.to === e.to && p.countryCode === e.countryCode
    )
    return found ?? {
      id: '', from: e.from, to: e.to, rate: 0, urgent: false,
      active: false, country: e.country, countryCode: e.countryCode, flag: e.flag,
    }
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

function methodClass(m: string) {
  if (m === 'Bank Transfer') return 'bg-[#ecfdf5] border-[#c7e9d9] text-[#0b5e42]'
  if (m === 'Mobile Money')  return 'bg-[#fff7ed] border-[#ffedd5] text-[#9a3412]'
  if (m === 'Cash Pickup')   return 'bg-[#eff6ff] border-[#dbeafe] text-[#1e40af]'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

// ── PlaceholderPairRow (corridor not yet configured in Firestore) ─────────────

function PlaceholderPairRow({
  pair,
  onAdded,
}: {
  pair: CurrencyPair
  onAdded: () => void
}) {
  const [rate, setRate] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const countryLabel = pair.country ?? pair.countryCode ?? ''

  const handleAdd = async () => {
    const r = parseFloat(rate)
    if (isNaN(r) || r <= 0) { setErr('Enter a valid rate'); return }
    setAdding(true)
    setErr('')
    try {
      await addCurrencyPair({
        from: pair.from,
        to: pair.to,
        rate: r,
        urgent: false,
        active: true,
        country: pair.country,
        countryCode: pair.countryCode,
        flag: pair.flag,
      })
      onAdded()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 border-b border-[#f0f4fa] bg-[#fafbff] opacity-70 hover:opacity-100 transition-opacity">
      {/* LEFT: pair code + country */}
      <div className="flex items-center gap-8 flex-wrap min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="font-bold text-[#94a3b8] text-[16px] leading-tight font-mono">
            {pair.from}_{pair.to}
          </p>
          <p className="text-[13px] text-[#94a3b8] leading-tight">{pair.from} → {pair.to}</p>
          <p className="text-[13px] text-[#5c6e8c] font-medium leading-tight truncate">{countryLabel}</p>
        </div>
        <span className="text-[11px] text-slate-400 italic border border-dashed border-slate-300 px-2.5 py-1 rounded-full">
          Not configured
        </span>
      </div>

      {/* RIGHT: rate input + add */}
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          step="0.0001"
          min="0"
          placeholder="Set rate…"
          value={rate}
          onChange={e => { setRate(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className="w-28 px-2 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right placeholder:text-slate-300"
        />
        <span className="text-[11px] text-slate-400">{pair.to}</span>
        <button
          onClick={handleAdd}
          disabled={adding || !rate}
          className="text-[11px] px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-semibold disabled:opacity-40 transition-all"
        >
          {adding ? '…' : '+ Add'}
        </button>
        {err && <span className="text-[10px] text-red-500">{err}</span>}
      </div>
    </div>
  )
}

// ── PairRow (single pair item inside a currency card) ─────────────────────────

function PairRow({
  pair,
  onRateChange,
  onUrgencyToggle,
  onToggleActive,
  onDelete,
  onDeliveryChange,
  onFeeChange,
  onSpreadChange,
  onViewHistory,
}: {
  pair: CurrencyPair
  onRateChange:    (id: string, rate: number) => void
  onUrgencyToggle: (id: string, urgent: boolean) => void
  onToggleActive:  (id: string, active: boolean) => void
  onDelete:        (id: string) => void
  onDeliveryChange:(id: string, methods: string[]) => void
  onFeeChange: (id: string, fee: number, feeType: 'flat' | 'percent') => void
  onSpreadChange: (id: string, spread: number, spreadType: 'flat' | 'percent') => void
  onViewHistory: (pair: CurrencyPair) => void
}) {
  const [rate, setRate]     = useState(String(pair.rate))
  const [fee, setFee]       = useState(String(pair.fee ?? 0))
  const [spread, setSpread] = useState(String(pair.spread ?? 0))
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const active    = pair.active !== false
  const deliveries = pair.deliveryMethods ?? []

  // Sync local inputs when Firestore updates the pair prop (only when not focused)
  const rateFocused   = React.useRef(false)
  const feeFocused    = React.useRef(false)
  const spreadFocused = React.useRef(false)
  useEffect(() => { if (!rateFocused.current)   setRate(String(pair.rate))       }, [pair.rate])
  useEffect(() => { if (!feeFocused.current)     setFee(String(pair.fee ?? 0))   }, [pair.fee])
  useEffect(() => { if (!spreadFocused.current)  setSpread(String(pair.spread ?? 0)) }, [pair.spread])

  // Debounced save timers – ensures typing without blurring still persists to Firestore
  const rateTimer   = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const feeTimer    = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const spreadTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRateInput = (val: string) => {
    setRate(val)
    if (rateTimer.current) clearTimeout(rateTimer.current)
    rateTimer.current = setTimeout(() => {
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) onRateChange(pair.id, n)
    }, 200)
  }

  const handleFeeInput = (val: string) => {
    setFee(val)
    if (feeTimer.current) clearTimeout(feeTimer.current)
    feeTimer.current = setTimeout(() => {
      const n = parseFloat(val)
      if (!isNaN(n) && n >= 0) onFeeChange(pair.id, n, pair.feeType ?? 'flat')
    }, 200)
  }

  const handleSpreadInput = (val: string) => {
    setSpread(val)
    if (spreadTimer.current) clearTimeout(spreadTimer.current)
    spreadTimer.current = setTimeout(() => {
      const n = parseFloat(val)
      if (!isNaN(n) && n >= 0) onSpreadChange(pair.id, n, pair.spreadType ?? 'flat')
    }, 200)
  }

  const saveRateNow   = (val: string) => { if (rateTimer.current)   clearTimeout(rateTimer.current);   const n = parseFloat(val); if (!isNaN(n) && n > 0)  onRateChange(pair.id, n) }
  const saveFeeNow    = (val: string) => { if (feeTimer.current)    clearTimeout(feeTimer.current);    const n = parseFloat(val); if (!isNaN(n) && n >= 0) onFeeChange(pair.id, n, pair.feeType ?? 'flat') }
  const saveSpreadNow = (val: string) => { if (spreadTimer.current) clearTimeout(spreadTimer.current); const n = parseFloat(val); if (!isNaN(n) && n >= 0) onSpreadChange(pair.id, n, pair.spreadType ?? 'flat') }

  // Display label
  const countryLabel = pair.country ?? pair.countryCode ?? ''

  const toggleDelivery = (method: string) => {
    const updated = deliveries.includes(method)
      ? deliveries.filter(m => m !== method)
      : [...deliveries, method]
    onDeliveryChange(pair.id, updated)
  }

  return (
    <>
      {/* ── Main pair row ── */}
      <div className={`flex items-center justify-between gap-4 flex-wrap px-6 py-4 border-b border-[#f0f4fa] transition-opacity ${active ? '' : 'opacity-40'}`}>

        {/* LEFT: pair code + direction + country */}
        <div className="flex items-center gap-8 flex-wrap min-w-0">

          {/* Code + direction + country stacked */}
          <div className="flex flex-col gap-1 min-w-0">
            <p className="font-bold text-[#0f172a] text-[16px] leading-tight font-mono">
              {pair.from}_{pair.to}
            </p>
            <p className="text-[13px] text-[#64748b] leading-tight">
              {pair.from} → {pair.to}
            </p>
            <p className="text-[13px] text-[#5c6e8c] font-medium leading-tight truncate">
              {countryLabel}
            </p>
          </div>

          {/* Delivery method tags */}
          <div className="flex flex-wrap gap-2">
            {deliveries.length > 0
              ? deliveries.map(m => (
                  <span key={m} className={`text-[11px] font-semibold px-3.5 py-1.5 rounded-full border ${methodClass(m)}`}>
                    {m}
                  </span>
                ))
              : <span className="text-[11px] text-slate-400 italic">No methods set</span>
            }
          </div>
        </div>

        {/* RIGHT: rate input + controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">

          {/* Inline rate */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={rate}
              onChange={e => handleRateInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); saveRateNow(rate) } }}
              onFocus={() => { rateFocused.current = true }}
              onBlur={() => {
                rateFocused.current = false
                if (rateTimer.current) { clearTimeout(rateTimer.current); rateTimer.current = null }
                const n = parseFloat(rate)
                if (!isNaN(n) && n > 0) onRateChange(pair.id, n)
              }}
              className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
            />
            <span className="text-[11px] text-slate-400">{pair.to}</span>
          </div>

          {/* Urgent toggle */}
          <button
            onClick={() => onUrgencyToggle(pair.id, !pair.urgent)}
            title="Priority"
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-all ${
              pair.urgent ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-500'
            }`}
          >
            {pair.urgent ? <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> : <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />}
          </button>

          {/* Active toggle */}
          <button
            onClick={() => onToggleActive(pair.id, !active)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-all ${
              active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            {active ? '✓' : '○'}
          </button>

          {/* History */}
          <button
            onClick={() => onViewHistory(pair)}
            title="Rate history"
            className="text-[11px] px-2 py-1 border border-slate-200 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
          ><TrendingUp className="w-3.5 h-3.5" /></button>

          {/* Expand */}
          <button
            onClick={() => setExpanded(e => !e)}
            title="Settings"
            className={`text-[11px] px-2 py-1 border rounded-lg transition-all ${
              expanded
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                : 'border-slate-200 text-slate-400 hover:border-indigo-200 hover:text-indigo-500'
            }`}
          >{expanded ? '▲' : '▼'}</button>

          {/* Delete */}
          <button
            onClick={async () => {
              if (!confirm(`Delete ${pair.from} → ${pair.to} (${countryLabel})?`)) return
              setDeleting(true)
              await onDelete(pair.id)
            }}
            disabled={deleting}
            className="text-[11px] px-2 py-1 border border-red-100 text-red-400 rounded-lg hover:bg-red-50 hover:border-red-300 disabled:opacity-40 transition-all"
          >{deleting ? '…' : <Trash2 className="w-3.5 h-3.5" />}</button>
        </div>
      </div>

      {/* ── Expanded: delivery, fee, spread ── */}
      {expanded && (
        <div className="px-6 py-4 bg-indigo-50/40 border-b border-indigo-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Delivery Methods */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> Delivery Methods</p>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_OPTIONS.map(method => (
                  <button
                    key={method}
                    onClick={() => toggleDelivery(method)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                      deliveries.includes(method)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-200 hover:text-indigo-500'
                    }`}
                  >
                    {deliveries.includes(method) ? '✓ ' : ''}{method}
                  </button>
                ))}
              </div>
            </div>

            {/* Fee */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Transaction Fee</p>
              <div className="flex items-center gap-2">
                <input
                  type="number" step="0.01" min="-100"
                  value={fee}
                  onChange={e => handleFeeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); saveFeeNow(fee) } }}
                  onFocus={() => { feeFocused.current = true }}
                  onBlur={() => {
                    feeFocused.current = false
                    if (feeTimer.current) { clearTimeout(feeTimer.current); feeTimer.current = null }
                    const n = parseFloat(fee)
                    if (!isNaN(n) && n >= 0) onFeeChange(pair.id, n, pair.feeType ?? 'flat')
                  }}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <select
                  value={pair.feeType ?? 'flat'}
                  onChange={e => {
                    const n = parseFloat(fee)
                    if (!isNaN(n) && n >= 0) onFeeChange(pair.id, n, e.target.value as 'flat' | 'percent')
                  }}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="flat">Flat</option>
                  <option value="percent">%</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {pair.feeType === 'percent'
                  ? `${parseFloat(fee) > 0 ? '+' : ''}${fee || 0}% of send amount${parseFloat(fee) < 0 ? ' (discount)' : ''}`
                  : `Fixed ${fee || 0} ${pair.from}${parseFloat(fee) < 0 ? ' (discount)' : ''}`}
              </p>
            </div>

            {/* Live Rate Discount */}
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-sky-500" /> Live Rate Discount
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 font-mono select-none">−</span>
                <input
                  type="number" step="0.0001" min="0"
                  value={spread}
                  onChange={e => handleSpreadInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); saveSpreadNow(spread) } }}
                  onFocus={() => { spreadFocused.current = true }}
                  onBlur={() => {
                    spreadFocused.current = false
                    if (spreadTimer.current) { clearTimeout(spreadTimer.current); spreadTimer.current = null }
                    const n = parseFloat(spread)
                    if (!isNaN(n) && n >= 0) onSpreadChange(pair.id, n, pair.spreadType ?? 'flat')
                  }}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 font-mono"
                />
                <select
                  value={pair.spreadType ?? 'flat'}
                  onChange={e => {
                    const n = parseFloat(spread)
                    if (!isNaN(n) && n >= 0) onSpreadChange(pair.id, n, e.target.value as 'flat' | 'percent')
                  }}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  <option value="flat">{pair.to}</option>
                  <option value="percent">%</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {parseFloat(spread) > 0
                  ? pair.spreadType === 'percent'
                    ? `Live rate × (1 − ${spread}%) applied on sync`
                    : `Live rate − ${spread} ${pair.to} applied on sync`
                  : 'No discount — full live rate used on sync'
                }
              </p>
            </div>

          </div>
        </div>
      )}
    </>
  )
}

// ── CurrencyCard (one card per direction corridor) ────────────────────────────

function CurrencyCard({
  currencyCode,
  currencyName,
  direction,
  pairs,
  rowProps,
  onPairAdded,
}: {
  currencyCode: string
  currencyName: string
  direction: string
  pairs: CurrencyPair[]
  rowProps: Omit<Parameters<typeof PairRow>[0], 'pair'>
  onPairAdded: () => void
}) {
  if (pairs.length === 0) return null
  const configuredCount = pairs.filter(p => p.id !== '').length
  return (
    <div className="bg-white rounded-3xl border border-[#edf2f7] overflow-hidden" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.03)'}}>
      {/* Card header */}
      <div className="flex items-baseline justify-between px-6 py-[18px] bg-[#fafcff] border-b border-[#edf2f7] flex-wrap gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl font-bold text-[#0f172a]">{currencyCode}</span>
          <span className="text-[15px] text-[#5c6e8c] font-medium">{currencyName}</span>
          <span className="text-[13px] text-[#94a3b8] font-mono">{direction}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-[#eef2ff] text-[#1e40af] text-[13px] font-semibold px-3 py-1 rounded-[40px]">
            {configuredCount} / {pairs.length} configured
          </span>
        </div>
      </div>
      {/* Pair rows */}
      <div>
        {pairs.map(pair =>
          pair.id !== ''
            ? <PairRow key={pair.id} pair={pair} {...rowProps} />
            : <PlaceholderPairRow
                key={`placeholder_${pair.from}_${pair.to}_${pair.countryCode}`}
                pair={pair}
                onAdded={onPairAdded}
              />
        )}
      </div>
    </div>
  )
}

// ── CollapsibleCurrencyGroup ─────────────────────────────────────────────────

function CollapsibleCurrencyGroup({
  currency, currencyName, xafPairs, xofPairs, rowProps, searchTerm,
}: {
  currency: string
  currencyName: string
  xafPairs: CurrencyPair[]
  xofPairs: CurrencyPair[]
  rowProps: Omit<Parameters<typeof PairRow>[0], 'pair'>
  searchTerm: string
}) {
  const [expanded, setExpanded] = useState(false)
  const configuredCount = [...xafPairs, ...xofPairs].filter(p => p.id !== '').length
  const totalCount = xafPairs.length + xofPairs.length

  const filter = (list: CurrencyPair[]) => {
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(p =>
      (p.country ?? '').toLowerCase().includes(q) ||
      (p.countryCode ?? '').toLowerCase().includes(q) ||
      p.from.toLowerCase().includes(q) ||
      p.to.toLowerCase().includes(q)
    )
  }

  const filtXaf = filter(xafPairs)
  const filtXof = filter(xofPairs)
  if (filtXaf.length === 0 && filtXof.length === 0) return null

  // Auto-expand when a search term is active
  const isExpanded = searchTerm.trim() ? true : expanded

  return (
    <div className="bg-white rounded-3xl border border-[#edf2f7] overflow-hidden" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.03)'}}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-[18px] bg-[#fafcff] border-b border-[#edf2f7] hover:bg-indigo-50/40 transition-colors"
      >
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl font-bold text-[#0f172a]">{currency}</span>
          <span className="text-[15px] text-[#5c6e8c] font-medium">{currencyName}</span>
          <span className="text-[13px] text-[#94a3b8] font-mono">{currency} → XOF / XAF</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[13px] font-semibold px-3 py-1 rounded-[40px] ${
            configuredCount > 0 ? 'bg-[#eef2ff] text-[#1e40af]' : 'bg-gray-100 text-gray-400'
          }`}>{configuredCount} / {totalCount} configured</span>
          <span className="text-slate-400 text-[13px]">{isExpanded ? '▲' : '▼ expand'}</span>
        </div>
      </button>
      {isExpanded && (
        <div>
          {filtXaf.length > 0 && (
            <>
              <div className="px-6 py-2 bg-slate-50 border-b border-[#edf2f7]">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{currency} → XAF · Central African CFA Franc</span>
              </div>
              {filtXaf.map(pair =>
                pair.id !== ''
                  ? <PairRow key={pair.id} pair={pair} {...rowProps} />
                  : <PlaceholderPairRow
                      key={`ph_${pair.from}_${pair.to}_${pair.countryCode}`}
                      pair={pair}
                      onAdded={() => {}}
                    />
              )}
            </>
          )}
          {filtXof.length > 0 && (
            <>
              <div className="px-6 py-2 bg-slate-50 border-b border-[#edf2f7]">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{currency} → XOF · West African CFA Franc</span>
              </div>
              {filtXof.map(pair =>
                pair.id !== ''
                  ? <PairRow key={pair.id} pair={pair} {...rowProps} />
                  : <PlaceholderPairRow
                      key={`ph_${pair.from}_${pair.to}_${pair.countryCode}`}
                      pair={pair}
                      onAdded={() => {}}
                    />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── AddPairForm ───────────────────────────────────────────────────────────────

// Quick-pick data for the free-form AddPairForm
const ALL_COUNTRIES = [
  // ── XOF countries (already in static data) ────────────────────────────────
  ...XOF_COUNTRIES.map(c => ({ name: c.country, code: c.countryCode, flag: c.flag })),
  // ── XAF countries ─────────────────────────────────────────────────────────
  ...XAF_COUNTRIES.map(c => ({ name: c.country, code: c.countryCode, flag: c.flag })),
  // ── Rest of Africa (A–Z) ──────────────────────────────────────────────────
  { name: 'Algeria',                  code: 'DZA', flag: '🇩🇿' },
  { name: 'Angola',                   code: 'AGO', flag: '🇦🇴' },
  { name: 'Botswana',                 code: 'BWA', flag: '🇧🇼' },
  { name: 'Burundi',                  code: 'BDI', flag: '🇧🇮' },
  { name: 'Cape Verde',               code: 'CPV', flag: '🇨🇻' },
  { name: 'Comoros',                  code: 'COM', flag: '🇰🇲' },
  { name: 'Djibouti',                 code: 'DJI', flag: '🇩🇯' },
  { name: 'DR Congo',                 code: 'COD', flag: '🇨🇩' },
  { name: 'Egypt',                    code: 'EGY', flag: '🇪🇬' },
  { name: 'Eritrea',                  code: 'ERI', flag: '🇪🇷' },
  { name: 'Eswatini',                 code: 'SWZ', flag: '🇸🇿' },
  { name: 'Ethiopia',                 code: 'ETH', flag: '🇪🇹' },
  { name: 'Ghana',                    code: 'GHA', flag: '🇬🇭' },
  { name: 'Guinea',                   code: 'GIN', flag: '🇬🇳' },
  { name: 'Kenya',                    code: 'KEN', flag: '🇰🇪' },
  { name: 'Lesotho',                  code: 'LSO', flag: '🇱🇸' },
  { name: 'Liberia',                  code: 'LBR', flag: '🇱🇷' },
  { name: 'Libya',                    code: 'LBY', flag: '🇱🇾' },
  { name: 'Madagascar',               code: 'MDG', flag: '🇲🇬' },
  { name: 'Malawi',                   code: 'MWI', flag: '🇲🇼' },
  { name: 'Mauritania',               code: 'MRT', flag: '🇲🇷' },
  { name: 'Mauritius',                code: 'MUS', flag: '🇲🇺' },
  { name: 'Morocco',                  code: 'MAR', flag: '🇲🇦' },
  { name: 'Mozambique',               code: 'MOZ', flag: '🇲🇿' },
  { name: 'Namibia',                  code: 'NAM', flag: '🇳🇦' },
  { name: 'Nigeria',                  code: 'NGA', flag: '🇳🇬' },
  { name: 'Rwanda',                   code: 'RWA', flag: '🇷🇼' },
  { name: 'São Tomé & Príncipe',      code: 'STP', flag: '🇸🇹' },
  { name: 'Seychelles',               code: 'SYC', flag: '🇸🇨' },
  { name: 'Sierra Leone',             code: 'SLE', flag: '🇸🇱' },
  { name: 'Somalia',                  code: 'SOM', flag: '🇸🇴' },
  { name: 'South Africa',             code: 'ZAF', flag: '🇿🇦' },
  { name: 'South Sudan',              code: 'SSD', flag: '🇸🇸' },
  { name: 'Sudan',                    code: 'SDN', flag: '🇸🇩' },
  { name: 'Tanzania',                 code: 'TZA', flag: '🇹🇿' },
  { name: 'Tunisia',                  code: 'TUN', flag: '🇹🇳' },
  { name: 'Uganda',                   code: 'UGA', flag: '🇺🇬' },
  { name: 'Zambia',                   code: 'ZMB', flag: '🇿🇲' },
  { name: 'Zimbabwe',                 code: 'ZWE', flag: '🇿🇼' },
  // ── Non-African sending countries ─────────────────────────────────────────
  { name: 'Russia',                   code: 'RUS', flag: '🇷🇺' },
  { name: 'China',                    code: 'CHN', flag: '🇨🇳' },
  { name: 'India',                    code: 'IND', flag: '🇮🇳' },
  { name: 'UAE',                      code: 'ARE', flag: '🇦🇪' },
  { name: 'Turkey',                   code: 'TUR', flag: '🇹🇷' },
  { name: 'United Kingdom',           code: 'GBR', flag: '🇬🇧' },
  { name: 'United States',            code: 'USA', flag: '🇺🇸' },
  { name: 'European Union',           code: 'EUZ', flag: '🇪🇺' },
]

function AddPairForm({ onAdded }: { onAdded: () => void }) {
  const [from, setFrom]           = useState('RUB')
  const [to, setTo]               = useState('XOF')
  const [country, setCountry]     = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [flag, setFlag]           = useState('')
  const [rate, setRate]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountryList, setShowCountryList] = useState(false)

  const selectCountry = (c: typeof ALL_COUNTRIES[0]) => {
    setCountry(c.name)
    setCountryCode(c.code)
    setFlag(c.flag)
    setCountrySearch('')
    setShowCountryList(false)
  }

  const filteredCountries = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fromTrimmed = from.trim().toUpperCase()
    const toTrimmed   = to.trim().toUpperCase()
    const r = parseFloat(rate)
    if (!fromTrimmed || !toTrimmed) { setErr('Both currency codes are required'); return }
    if (fromTrimmed === toTrimmed)  { setErr('From and To currencies must be different'); return }
    if (isNaN(r) || r <= 0)        { setErr('Enter a valid positive rate'); return }
    setSaving(true)
    setErr('')
    try {
      await addCurrencyPair({
        from: fromTrimmed,
        to: toTrimmed,
        rate: r,
        urgent: false,
        active: true,
        country: country || undefined,
        countryCode: countryCode || undefined,
        flag: flag || undefined,
      })
      setRate(''); setCountry(''); setCountryCode(''); setFlag('')
      onAdded()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* From currency */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Sending Currency (From) <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={from}
          onChange={e => setFrom(e.target.value.toUpperCase())}
          placeholder="e.g. RUB"
          maxLength={10}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['RUB','XOF','XAF','USD','EUR','GBP','USDT','NGN','GHS'].map(c => (
            <button key={c} type="button"
              onClick={() => setFrom(c)}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all ${from === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* To currency */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Receiving Currency (To) <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={to}
          onChange={e => setTo(e.target.value.toUpperCase())}
          placeholder="e.g. XOF"
          maxLength={10}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['XOF','XAF','RUB','USD','EUR','GBP','USDT','NGN','GHS'].map(c => (
            <button key={c} type="button"
              onClick={() => setTo(c)}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all ${to === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* Country */}
      <div className="relative">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Country <span className="text-gray-400">(optional)</span></label>
        <div className="flex gap-2">
          {flag && <span className="text-2xl leading-none mt-1">{flag}</span>}
          <input
            type="text"
            value={country}
            onChange={e => { setCountry(e.target.value); setCountryCode(''); setFlag(''); setCountrySearch(e.target.value); setShowCountryList(true) }}
            onFocus={() => { setCountrySearch(country); setShowCountryList(true) }}
            onBlur={() => setTimeout(() => setShowCountryList(false), 150)}
            placeholder="Type or pick a country…"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        {showCountryList && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2">
              <input
                type="text"
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
                placeholder="Search countries…"
                className="w-full text-xs border-none outline-none"
              />
            </div>
            {filteredCountries.map(c => (
              <button
                key={c.code}
                type="button"
                onMouseDown={() => selectCountry(c)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-indigo-50 text-left"
              >
                <span className="text-lg">{c.flag}</span>
                <span className="text-sm text-gray-800">{c.name}</span>
                <span className="ml-auto text-[11px] text-gray-400 font-mono">{c.code}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 italic">No match — type freely and we'll save what you enter</p>
            )}
          </div>
        )}
        {countryCode && (
          <p className="mt-1 text-[11px] text-indigo-600">Code: <span className="font-mono font-semibold">{countryCode}</span></p>
        )}
      </div>

      {/* Rate */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Exchange Rate <span className="text-red-500">*</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
            1 {from || '?'} =
          </span>
          <input
            type="number"
            step="any"
            min="0.0001"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="0.00"
            className="w-full pl-20 pr-16 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            required
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{to || '?'}</span>
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
      >
        {saving ? 'Adding…' : '+ Add Currency Pair'}
      </button>
    </form>
  )
}

// ── Rate History Modal ────────────────────────────────────────────────────────

function RateHistoryModal({ pair, onClose }: { pair: CurrencyPair; onClose: () => void }) {
  const [history, setHistory] = useState<RateHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRateHistory(pair.id).then(h => { setHistory(h); setLoading(false) })
  }, [pair.id])

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Rate History</h2>
            <p className="text-xs text-gray-500">
              {pair.flag} {pair.country} · {pair.from} → {pair.to} · last 20 changes
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-lg"
          >✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium">No rate changes recorded yet.</p>
              <p className="text-xs mt-1">Edit a rate to start tracking history.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Old</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">New</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Δ%</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => {
                  const delta = ((h.newRate - h.oldRate) / h.oldRate) * 100
                  return (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {h.changedAt ? new Date(h.changedAt.seconds * 1000).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-xs font-mono text-gray-500">{h.oldRate.toFixed(4)}</td>
                      <td className="py-2 px-2 text-right text-xs font-mono font-semibold text-gray-900">{h.newRate.toFixed(4)}</td>
                      <td className={`py-2 px-2 text-right text-xs font-semibold ${
                        delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
                      </td>
                      <td className="py-2 text-right text-xs text-gray-400">{h.changedBy}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bulk Rate Edit ────────────────────────────────────────────────────────────

function BulkRateEdit({ pairs, onClose }: { pairs: CurrencyPair[]; onClose: () => void }) {
  const [adjustment, setAdjustment] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState('')
  const adj = parseFloat(adjustment) || 0

  const handleApply = async () => {
    if (adj === 0) return
    if (!confirm(`Apply ${adj > 0 ? '+' : ''}${adj}% to all ${pairs.length} visible pair(s)?`)) return
    setApplying(true)
    setResult('')
    try {
      const factor = 1 + adj / 100
      for (const pair of pairs) {
        const oldRate = pair.rate
        const newRate = parseFloat((oldRate * factor).toFixed(4))
        await updateCurrencyPair(pair.id, { rate: newRate })
        await logRateChange(pair, oldRate, newRate, 'admin (bulk)')
      }
      setResult(`✅ Updated ${pairs.length} pairs by ${adj > 0 ? '+' : ''}${adj}%`)
    } catch (e: any) {
      setResult('❌ ' + (e?.message ?? 'Failed'))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900">⚡ Bulk Rate Adjustment</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Apply a % change to all {pairs.length} currently filtered pair(s)
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-lg"
        >✕</button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Adjustment:</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={adjustment}
              onChange={e => setAdjustment(e.target.value)}
              placeholder="e.g. 2 or -1.5"
              className="w-36 px-3 py-2 pr-7 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
        </div>
        {adj !== 0 && (
          <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Factor ×{(1 + adj / 100).toFixed(4)} on {pairs.length} pair(s)
          </p>
        )}
        <button
          onClick={handleApply}
          disabled={applying || adj === 0}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'Apply to Filtered Pairs'}
        </button>
      </div>
      {result && (
        <p className={`mt-3 text-sm font-medium ${result.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
          {result}
        </p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// ── MarketRatesPanel ──────────────────────────────────────────────────────────

function MarketRatesPanel({ pairs, onClose }: { pairs: CurrencyPair[]; onClose: () => void }) {
  const [apiKey, setApiKey]       = useState('')
  const [quotes, setQuotes]       = useState<MarketQuotes | null>(null)
  const [fetching, setFetching]   = useState(false)
  const [fetchErr, setFetchErr]   = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved]   = useState(false)
  const [applying, setApplying]   = useState(false)
  const [applyResult, setApplyResult] = useState('')

  // Local spread overrides: pairId → { value, type }
  const [spreads, setSpreads] = useState<Record<string, { value: string; type: 'flat' | 'percent' }>>({})

  // Load stored API key on mount — auto-fetch if key already exists
  useEffect(() => {
    loadApiKey().then(k => {
      if (!k) return
      setApiKey(k)
      // Auto-fetch rates immediately when a saved key is found
      setFetching(true)
      setFetchErr('')
      fetchMarketQuotes(k)
        .then(q => setQuotes(q))
        .catch((e: any) => setFetchErr(e?.message ?? 'Auto-fetch failed'))
        .finally(() => setFetching(false))
    })
  }, [])

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    try { await saveApiKey(apiKey.trim()); setKeySaved(true); setTimeout(() => setKeySaved(false), 2000) }
    catch (e: any) { setFetchErr(e?.message ?? 'Failed to save key') }
    finally { setSavingKey(false) }
  }

  const handleFetch = async () => {
    if (!apiKey.trim()) { setFetchErr('Enter your currencylayer API key first'); return }
    setFetching(true); setFetchErr('')
    try {
      const q = await fetchMarketQuotes(apiKey.trim())
      setQuotes(q)
    } catch (e: any) {
      setFetchErr(e?.message ?? 'Failed to fetch rates')
    } finally {
      setFetching(false)
    }
  }

  // Compute per-pair: market rate, spread, resulting rate
  const rows = useMemo(() => {
    if (!quotes) return []
    const seen = new Set<string>()
    return pairs.filter(p => {
      const key = `${p.from}_${p.to}_${p.countryCode ?? ''}`
      if (seen.has(key)) return false
      seen.add(key); return true
    }).map(p => {
      const market = crossRate(quotes.raw, p.from, p.to)
      const sp = spreads[p.id] ?? { value: String(p.spread ?? 0), type: p.spreadType ?? 'flat' }
      const spVal = parseFloat(sp.value) || 0
      const resulting = market == null ? null
        : sp.type === 'percent'
          ? market * (1 - spVal / 100)
          : market - spVal
      return { pair: p, market, sp, resulting }
    })
  }, [quotes, pairs, spreads])

  const handleApplyAll = async () => {
    if (!quotes || rows.length === 0) return
    if (!confirm(`Apply market rates (with spreads) to ${rows.filter(r => r.resulting != null).length} pairs?`)) return
    setApplying(true); setApplyResult('')
    let ok = 0; let fail = 0
    for (const { pair, market, sp, resulting } of rows) {
      if (market == null || resulting == null) { fail++; continue }
      const newRate = parseFloat(resulting.toFixed(4))
      try {
        await logRateChange(pair, pair.rate, newRate, 'admin (market sync)')
        await updateCurrencyPair(pair.id, {
          rate: newRate,
          spread: parseFloat(sp.value) || 0,
          spreadType: sp.type,
        })
        ok++
      } catch { fail++ }
    }
    setApplying(false)
    setApplyResult(`✅ Updated ${ok} pairs${fail > 0 ? ` · ❌ ${fail} failed` : ''}`)
  }

  return (
    <div className="bg-white rounded-2xl border border-sky-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-sky-50 border-b border-sky-100">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-sky-600" />
          <h3 className="font-bold text-slate-800">Live Market Rates — currencylayer</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
      </div>

      <div className="p-6 space-y-5">
        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">currencylayer API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste your API key here…"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 font-mono"
            />
            <button
              onClick={handleSaveKey}
              disabled={savingKey || !apiKey.trim()}
              className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >{savingKey ? 'Saving…' : keySaved ? '✓ Saved' : 'Save Key'}</button>
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? 'Fetching…' : 'Fetch Rates'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Get a free key at{' '}
            <a href="https://currencylayer.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">currencylayer.com</a>.
            Free plan uses USD as base — all cross rates are derived automatically.
          </p>
          {fetchErr && <p className="text-xs text-red-600 mt-1.5 font-medium">{fetchErr}</p>}
        </div>

        {/* Live rates table */}
        {quotes && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500">
                Fetched {new Date(quotes.fetchedAt).toLocaleTimeString()} — {rows.length} pair(s)
              </p>
              <button
                onClick={handleApplyAll}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Zap className="w-4 h-4" />
                {applying ? 'Applying…' : `Sync All to Firestore (${rows.filter(r => r.resulting != null).length})`}
              </button>
            </div>
            {applyResult && <p className="text-sm font-medium text-emerald-700 mb-3">{applyResult}</p>}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Pair</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Market Rate</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Spread (−)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Your Rate</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ pair, market, sp, resulting }) => {
                    const diff = market != null && resulting != null ? resulting - market : null
                    return (
                      <tr key={pair.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {/* Pair */}
                        <td className="px-4 py-2.5">
                          <p className="font-mono font-semibold text-slate-800 text-xs">{pair.from} → {pair.to}</p>
                          <p className="text-[11px] text-slate-400">{pair.flag} {pair.country}</p>
                        </td>
                        {/* Market rate */}
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-mono text-slate-600 text-xs">
                            {market != null ? market.toFixed(4) : <span className="text-red-400">N/A</span>}
                          </span>
                        </td>
                        {/* Spread inputs */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              step="0.0001"
                              value={sp.value}
                              onChange={e => setSpreads(s => ({ ...s, [pair.id]: { ...sp, value: e.target.value } }))}
                              className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                            />
                            <select
                              value={sp.type}
                              onChange={e => setSpreads(s => ({ ...s, [pair.id]: { ...sp, type: e.target.value as 'flat' | 'percent' } }))}
                              className="px-1.5 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-300"
                            >
                              <option value="flat">{pair.to}</option>
                              <option value="percent">%</option>
                            </select>
                          </div>
                        </td>
                        {/* Resulting rate */}
                        <td className="px-4 py-2.5 text-right">
                          {resulting != null
                            ? <span className={`font-mono font-bold text-xs ${resulting < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{resulting.toFixed(4)}</span>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>
                        {/* Diff */}
                        <td className="px-4 py-2.5 text-right">
                          {diff != null
                            ? <span className={`text-[11px] font-semibold ${diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(4)}
                              </span>
                            : null
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const CurrencyPairs: React.FC = () => {
  const { data: pairs, loading } = useFirestoreQuery<CurrencyPair>('currencyPairs')
  const [searchTerm, setSearchTerm]       = useState('')
  const [showAdd, setShowAdd]             = useState(false)
  const [showBulk, setShowBulk]           = useState(false)
  const [showMarket, setShowMarket]       = useState(false)
  const [deactivating, setDeactivating]   = useState(false)
  const [historyPair, setHistoryPair] = useState<CurrencyPair | null>(null)

  // ── 4 directional merged lists (always show all corridors) ───────────────

  const mergedRubXaf = useMemo(() =>
    mergeWithLive(EXPECTED_RUB_XAF, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')), [pairs])

  const mergedRubXof = useMemo(() =>
    mergeWithLive(EXPECTED_RUB_XOF, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')), [pairs])

  const mergedXafRub = useMemo(() =>
    mergeWithLive(EXPECTED_XAF_RUB, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')), [pairs])

  const mergedXofRub = useMemo(() =>
    mergeWithLive(EXPECTED_XOF_RUB, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')), [pairs])

  // Extra sending currency corridors (USD, EUR, GBP, USDT, CNY, AED)
  const extraCorridors = useMemo(() =>
    EXTRA_SENDING.map(c => {
      const { xof, xaf } = buildCorridors(c.code)
      return {
        ...c,
        xof: mergeWithLive(xof, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')),
        xaf: mergeWithLive(xaf, pairs).sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '')),
      }
    }), [pairs])

  // Custom (non-static) corridor groups
  const STATIC_CORRIDORS = useMemo(() => new Set([
    'RUB_XAF', 'RUB_XOF', 'XAF_RUB', 'XOF_RUB',
    ...EXTRA_SENDING.flatMap(c => [`${c.code}_XAF`, `${c.code}_XOF`]),
  ]), [])

  const customGroups = useMemo(() => {
    const custom = pairs.filter(p => !STATIC_CORRIDORS.has(`${p.from}_${p.to}`))
    const groups: Record<string, CurrencyPair[]> = {}
    custom.forEach(p => {
      const key = `${p.from}_${p.to}`
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }, [pairs, STATIC_CORRIDORS])

  // Apply search filter
  const filterBySearch = (list: CurrencyPair[]) => {
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(p =>
      (p.country ?? '').toLowerCase().includes(q) ||
      (p.countryCode ?? '').toLowerCase().includes(q) ||
      p.from.toLowerCase().includes(q) ||
      p.to.toLowerCase().includes(q)
    )
  }

  const filteredRubXaf = filterBySearch(mergedRubXaf)
  const filteredRubXof = filterBySearch(mergedRubXof)
  const filteredXafRub = filterBySearch(mergedXafRub)
  const filteredXofRub = filterBySearch(mergedXofRub)

  const customPairsFlat = Object.values(customGroups).flat()
  const extraFlat = extraCorridors.flatMap(c => [...c.xaf, ...c.xof])
  const bulkPairs = [...mergedRubXaf, ...mergedRubXof, ...mergedXafRub, ...mergedXofRub, ...customPairsFlat, ...extraFlat].filter(p => p.id !== '')
  const customTotal = Object.values(customGroups).reduce((s, g) => s + filterBySearch(g).length, 0)
  const extraTotal  = extraCorridors.reduce((s, c) => s + filterBySearch([...c.xaf, ...c.xof]).length, 0)
  const totalVisible = filteredRubXaf.length + filteredRubXof.length + filteredXafRub.length + filteredXofRub.length + customTotal + extraTotal

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleRateChange = async (id: string, rate: number) => {
    const pair = pairs.find(p => p.id === id)
    if (pair && pair.rate !== rate) await logRateChange(pair, pair.rate, rate)
    await updateCurrencyPair(id, { rate })
  }
  const handleUrgency        = (id: string, urgent: boolean)                          => updateCurrencyPair(id, { urgent })
  const handleToggleActive   = (id: string, active: boolean)                          => updateCurrencyPair(id, { active })
  const handleDelete         = (id: string)                                           => deleteCurrencyPair(id)
  const handleDeliveryChange = (id: string, deliveryMethods: string[])               => updateCurrencyPair(id, { deliveryMethods })
  const handleFeeChange      = (id: string, fee: number, feeType: 'flat' | 'percent') => updateCurrencyPair(id, { fee, feeType })
  const handleSpreadChange   = (id: string, spread: number, spreadType: 'flat' | 'percent') => updateCurrencyPair(id, { spread, spreadType })

  const rowProps = {
    onRateChange:    handleRateChange,
    onUrgencyToggle: handleUrgency,
    onToggleActive:  handleToggleActive,
    onDelete:        handleDelete,
    onDeliveryChange: handleDeliveryChange,
    onFeeChange:     handleFeeChange,
    onSpreadChange:  handleSpreadChange,
    onViewHistory:   setHistoryPair,
  }

  // ── loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const configuredCount = pairs.filter(p => p.active !== false).length

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Stats row ── */}
      <div className="flex gap-5 flex-wrap">
        <div className="bg-white rounded-[20px] border border-[#eef2f6] px-6 py-5 flex-1 min-w-[170px]" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.8px] text-[#6b7a8f] mb-2">Active Pairs</p>
          <p className="text-[38px] font-bold text-[#0f172a] leading-none">{configuredCount}</p>
          <p className="text-[12px] text-[#5c6e8c] mt-1.5">Currently supported currency conversions</p>
        </div>
        <div className="bg-white rounded-[20px] border border-[#eef2f6] px-6 py-5 flex-1 min-w-[170px]" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.8px] text-[#6b7a8f] mb-2">Sending Currencies</p>
          <p className="text-[38px] font-bold text-[#0f172a] leading-none">{1 + EXTRA_SENDING.length}</p>
          <p className="text-[12px] text-[#5c6e8c] mt-1.5">RUB · {EXTRA_SENDING.map(c => c.code).join(' · ')}</p>
        </div>
        <div className="bg-white rounded-[20px] border border-[#eef2f6] px-6 py-5 flex-1 min-w-[170px]" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.8px] text-[#6b7a8f] mb-2">Total Corridors</p>
          <p className="text-[38px] font-bold text-[#0f172a] leading-none">{pairs.length} / {TOTAL_EXPECTED}</p>
          <p className="text-[12px] text-[#5c6e8c] mt-1.5">{TOTAL_EXPECTED - pairs.length} corridors pending setup</p>
        </div>
      </div>

      {/* ── Action buttons row ── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={async () => {
            if (!confirm('Deactivate ALL active pairs?')) return
            setDeactivating(true)
            try { await deactivateAllPairs() } finally { setDeactivating(false) }
          }}
          disabled={deactivating}
          className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-all"
        >
          {deactivating ? <span className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full" /> : '⏸'}
          Deactivate All
        </button>
        <button
          onClick={() => setShowMarket(m => !m)}
          className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-all ${
            showMarket ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-sky-200 text-sky-700 hover:bg-sky-50'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Live Rates
        </button>
        <button
          onClick={() => setShowBulk(b => !b)}
          className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-all ${
            showBulk ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-amber-200 text-amber-700 hover:bg-amber-50'
          }`}
        >⚡ Bulk Edit</button>
        <button
          onClick={() => setShowAdd(a => !a)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all"
        >
          {showAdd ? '✕ Cancel' : '+ Add Pair'}
        </button>
      </div>

      {/* ── Add Pair form ── */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6">
          <h3 className="font-bold text-slate-900 mb-4">Add Currency Pair</h3>
          <AddPairForm onAdded={() => setShowAdd(false)} />
        </div>
      )}

      {/* ── Live Market Rates (currencylayer) ── */}
      {showMarket && (
        <MarketRatesPanel pairs={bulkPairs} onClose={() => setShowMarket(false)} />
      )}

      {/* ── Bulk Rate Edit ── */}
      {showBulk && (
        <BulkRateEdit pairs={bulkPairs} onClose={() => setShowBulk(false)} />
      )}

      {/* ── Search bar (pill style) ── */}
      <div className="flex items-center gap-2.5 bg-white border border-[#e2e8f0] rounded-[48px] px-[18px] py-2.5 max-w-sm">
        <Search className="text-[#94a3b8] w-4 h-4" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search currency pairs..."
          className="flex-1 border-none outline-none text-sm bg-transparent placeholder:text-[#94a3b8]"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-[#94a3b8] hover:text-slate-700 text-lg leading-none">✕</button>
        )}
      </div>

      {/* ── 4 directional currency cards ── */}
      <div className="space-y-6">

        {/* 1. RUB → XAF (6 corridors) */}
        {filteredRubXaf.length > 0 && (
          <CurrencyCard
            currencyCode="RUB"
            currencyName="Russian Ruble"
            direction="RUB → XAF"
            pairs={filteredRubXaf}
            rowProps={rowProps}
            onPairAdded={() => {}}
          />
        )}

        {/* 2. RUB → XOF (8 corridors) */}
        {filteredRubXof.length > 0 && (
          <CurrencyCard
            currencyCode="RUB"
            currencyName="Russian Ruble"
            direction="RUB → XOF"
            pairs={filteredRubXof}
            rowProps={rowProps}
            onPairAdded={() => {}}
          />
        )}

        {/* 3. XAF → RUB (6 corridors) */}
        {filteredXafRub.length > 0 && (
          <CurrencyCard
            currencyCode="XAF"
            currencyName="Central African CFA Franc"
            direction="XAF → RUB"
            pairs={filteredXafRub}
            rowProps={rowProps}
            onPairAdded={() => {}}
          />
        )}

        {/* 4. XOF → RUB (8 corridors) */}
        {filteredXofRub.length > 0 && (
          <CurrencyCard
            currencyCode="XOF"
            currencyName="West African CFA Franc"
            direction="XOF → RUB"
            pairs={filteredXofRub}
            rowProps={rowProps}
            onPairAdded={() => {}}
          />
        )}

        {/* Extra sending currencies — collapsible groups */}
        {extraCorridors.map(corridor => (
          <CollapsibleCurrencyGroup
            key={corridor.code}
            currency={corridor.code}
            currencyName={corridor.name}
            xafPairs={corridor.xaf}
            xofPairs={corridor.xof}
            rowProps={rowProps}
            searchTerm={searchTerm}
          />
        ))}

        {/* Dynamic custom corridor cards */}
        {Object.entries(customGroups).map(([key, groupPairs]) => {
          const [fromCode, toCode] = key.split('_')
          const filtered = filterBySearch(groupPairs)
          if (filtered.length === 0) return null
          return (
            <CurrencyCard
              key={key}
              currencyCode={fromCode}
              currencyName={fromCode}
              direction={`${fromCode} → ${toCode}`}
              pairs={filtered}
              rowProps={rowProps}
              onPairAdded={() => {}}
            />
          )
        })}

        {totalVisible === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-[#edf2f7]">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-semibold text-[#1e293b] mb-2">No currency pairs found</h3>
            <p className="text-[#5c6e8c] text-sm">Try a different search term</p>
          </div>
        )}
      </div>

      {/* ── Countries Reference Section ── */}
      <div className="bg-white rounded-3xl border border-[#edf2f7] overflow-hidden" style={{boxShadow:'0 1px 2px rgba(0,0,0,0.03)'}}>
        <div className="px-6 py-[18px] bg-[#fafcff] border-b border-[#edf2f7]">
          <h3 className="text-[17px] font-semibold text-[#0f172a] mb-1.5 flex items-center gap-2"><Globe className="w-5 h-5" /> Countries using CFA Francs</h3>
          <p className="text-[12px] text-[#6b7a8f]">* Each country has its own pair because exchange rates may vary by location</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* XAF */}
          <div>
            <h4 className="text-[14px] font-semibold text-[#1e293b] mb-3.5 pb-2 border-b-2 border-[#eef2ff]">XAF - Central African CFA Franc</h4>
            <div className="flex flex-col gap-2">
              {XAF_COUNTRIES.map(c => (
                <div key={c.countryCode} className="flex items-center justify-between px-3.5 py-2.5 bg-[#f8fafc] rounded-xl">
                  <span className="text-[14px] font-medium text-[#1e293b]">{c.flag} {c.country}</span>
                  <span className="text-[11px] text-[#6b7a8f] font-semibold font-mono bg-[#eef2ff] px-2 py-0.5 rounded-[20px]">{c.countryCode}</span>
                </div>
              ))}
            </div>
          </div>
          {/* XOF */}
          <div>
            <h4 className="text-[14px] font-semibold text-[#1e293b] mb-3.5 pb-2 border-b-2 border-[#eef2ff]">XOF - West African CFA Franc</h4>
            <div className="flex flex-col gap-2">
              {XOF_COUNTRIES.map(c => (
                <div key={c.countryCode} className="flex items-center justify-between px-3.5 py-2.5 bg-[#f8fafc] rounded-xl">
                  <span className="text-[14px] font-medium text-[#1e293b]">{c.flag} {c.country}</span>
                  <span className="text-[11px] text-[#6b7a8f] font-semibold font-mono bg-[#eef2ff] px-2 py-0.5 rounded-[20px]">{c.countryCode}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Rate History Modal ── */}
      {historyPair && (
        <RateHistoryModal pair={historyPair} onClose={() => setHistoryPair(null)} />
      )}
    </div>
  )
}

export default CurrencyPairs

