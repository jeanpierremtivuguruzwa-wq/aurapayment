import React, { useMemo, useState } from 'react'
import { useFirestoreQuery } from '../../hooks/useFirestoreQuery'
import { CurrencyPair } from '../../types/CurrencyPair'
import {
  addCurrencyPair,
  deleteCurrencyPair,
  seedDefaultPairs,
  updateCurrencyPair,
} from '../../services/currencyService'

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_LABELS: Record<string, string> = {
  RUB: 'Russian Ruble',
  XOF: 'West African CFA (XOF)',
  XAF: 'Central African CFA (XAF)',
  EUR: 'Euro',
  USD: 'US Dollar',
  GBP: 'British Pound',
}

const TO_CURRENCIES = ['XOF', 'XAF']
const FROM_CURRENCIES = ['RUB', 'EUR', 'USD', 'GBP']

// XOF countries with flags
const XOF_COUNTRIES = [
  { country: 'Senegal',       countryCode: 'SN', flag: '🇸🇳' },
  { country: "Côte d'Ivoire", countryCode: 'CI', flag: '🇨🇮' },
  { country: 'Mali',          countryCode: 'ML', flag: '🇲🇱' },
  { country: 'Burkina Faso',  countryCode: 'BF', flag: '🇧🇫' },
  { country: 'Guinea-Bissau', countryCode: 'GW', flag: '🇬🇼' },
  { country: 'Niger',         countryCode: 'NE', flag: '🇳🇪' },
  { country: 'Togo',          countryCode: 'TG', flag: '🇹🇬' },
  { country: 'Benin',         countryCode: 'BJ', flag: '🇧🇯' },
]

// XAF countries with flags
const XAF_COUNTRIES = [
  { country: 'Cameroon',             countryCode: 'CM', flag: '🇨🇲' },
  { country: 'Central African Rep.', countryCode: 'CF', flag: '🇨🇫' },
  { country: 'Chad',                 countryCode: 'TD', flag: '🇹🇩' },
  { country: 'Republic of Congo',    countryCode: 'CG', flag: '🇨🇬' },
  { country: 'Equatorial Guinea',    countryCode: 'GQ', flag: '🇬🇶' },
  { country: 'Gabon',                countryCode: 'GA', flag: '🇬🇦' },
]

const ALL_COUNTRIES = [
  ...XOF_COUNTRIES.map(c => ({ ...c, currency: 'XOF' })),
  ...XAF_COUNTRIES.map(c => ({ ...c, currency: 'XAF' })),
]

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Pair row ──────────────────────────────────────────────────────────────────

function PairRow({
  pair,
  onRateChange,
  onUrgencyToggle,
  onToggleActive,
  onDelete,
}: {
  pair: CurrencyPair
  onRateChange: (id: string, rate: number) => void
  onUrgencyToggle: (id: string, urgent: boolean) => void
  onToggleActive: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}) {
  const [rate, setRate] = useState(String(pair.rate))
  const [deleting, setDeleting] = useState(false)
  const active = pair.active !== false

  return (
    <tr className={`border-b border-gray-100 transition-colors ${active ? 'bg-white hover:bg-gray-50/50' : 'bg-gray-50/60 opacity-60'}`}>
      {/* Flag + Country */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{pair.flag || '🌍'}</span>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{pair.country || '—'}</p>
            <p className="text-[10px] text-gray-400">{pair.countryCode || ''}</p>
          </div>
        </div>
      </td>

      {/* Corridor */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{pair.from}</span>
          <span className="text-gray-400 text-xs">→</span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded ${
            pair.to === 'XOF' ? 'bg-yellow-100 text-yellow-800' : 'bg-orange-100 text-orange-800'
          }`}>{pair.to}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{CURRENCY_LABELS[pair.to] ?? pair.to}</p>
      </td>

      {/* Rate */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={e => setRate(e.target.value)}
            onBlur={() => {
              const n = parseFloat(rate)
              if (!isNaN(n) && n > 0) onRateChange(pair.id, n)
            }}
            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-xs text-gray-400">per {pair.from}</span>
        </div>
      </td>

      {/* Urgent */}
      <td className="py-3 px-4">
        <button
          onClick={() => onUrgencyToggle(pair.id, !pair.urgent)}
          className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-all ${
            pair.urgent
              ? 'bg-red-100 text-red-700 border-red-300'
              : 'bg-gray-100 text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-500'
          }`}
        >
          {pair.urgent ? '🔴 Urgent' : '⚪ Normal'}
        </button>
      </td>

      {/* Active */}
      <td className="py-3 px-4">
        <button
          onClick={() => onToggleActive(pair.id, !active)}
          className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-all ${
            active
              ? 'bg-green-100 text-green-700 border-green-300'
              : 'bg-gray-100 text-gray-400 border-gray-200'
          }`}
        >
          {active ? '✓ Active' : '○ Inactive'}
        </button>
      </td>

      {/* Delete */}
      <td className="py-3 px-4">
        <button
          onClick={async () => {
            if (!confirm(`Delete ${pair.from} → ${pair.to} (${pair.country ?? ''})?`)) return
            setDeleting(true)
            await onDelete(pair.id)
          }}
          disabled={deleting}
          className="text-xs px-2.5 py-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-all"
        >
          {deleting ? '…' : '🗑 Delete'}
        </button>
      </td>
    </tr>
  )
}

// ── Add Pair form ─────────────────────────────────────────────────────────────

function AddPairForm({ onAdded }: { onAdded: () => void }) {
  const [from, setFrom] = useState('RUB')
  const [to, setTo] = useState('XOF')
  const [countryInput, setCountryInput] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // When To changes, reset country
  const handleToChange = (v: string) => { setTo(v); setCountryInput('') }

  const countryOptions = to === 'XOF' ? XOF_COUNTRIES : to === 'XAF' ? XAF_COUNTRIES : []
  const selectedCountry = countryOptions.find(c => c.countryCode === countryInput)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = parseFloat(rate)
    if (!from || !to || isNaN(r) || r <= 0) { setErr('Fill all fields with a valid rate'); return }
    setSaving(true)
    setErr('')
    try {
      await addCurrencyPair({
        from,
        to,
        rate: r,
        urgent: false,
        active: true,
        country: selectedCountry?.country || countryInput || undefined,
        countryCode: selectedCountry?.countryCode || undefined,
        flag: selectedCountry?.flag || undefined,
      })
      setRate('')
      setCountryInput('')
      onAdded()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* From */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sending Currency (From)</label>
          <select
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {FROM_CURRENCIES.map(c => (
              <option key={c} value={c}>{c} — {CURRENCY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </div>

        {/* To */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Receiving Currency (To)</label>
          <select
            value={to}
            onChange={e => handleToChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {TO_CURRENCIES.map(c => (
              <option key={c} value={c}>{c} — {CURRENCY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </div>

        {/* Country */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Country</label>
          {countryOptions.length > 0 ? (
            <select
              value={countryInput}
              onChange={e => setCountryInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">— Select country —</option>
              {countryOptions.map(c => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.flag} {c.country}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={countryInput}
              onChange={e => setCountryInput(e.target.value)}
              placeholder="Country name (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          )}
        </div>

        {/* Rate */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Exchange Rate <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
              1 {from} =
            </span>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="0.00"
              className="w-full pl-16 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            />
          </div>
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

// ── Main component ────────────────────────────────────────────────────────────

const CurrencyPairs: React.FC = () => {
  const { data: pairs, loading } = useFirestoreQuery<CurrencyPair>('currencyPairs')
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState('')
  const [filterTo, setFilterTo] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)

  // Stats
  const stats = useMemo(() => {
    const active = pairs.filter(p => p.active !== false)
    const froms = new Set(pairs.map(p => p.from))
    const countries = new Set(pairs.map(p => p.countryCode).filter(Boolean))
    return {
      total: pairs.length,
      active: active.length,
      sendCurrencies: froms.size,
      countries: countries.size,
      xof: pairs.filter(p => p.to === 'XOF').length,
      xaf: pairs.filter(p => p.to === 'XAF').length,
    }
  }, [pairs])

  // Filtered + grouped
  const filtered = useMemo(() => {
    let list = [...pairs]
    if (filterTo !== 'all') list = list.filter(p => p.to === filterTo)
    if (filterFrom !== 'all') list = list.filter(p => p.from === filterFrom)
    // Group by to-currency then country
    return list.sort((a, b) => {
      if (a.to !== b.to) return a.to.localeCompare(b.to)
      return (a.country ?? '').localeCompare(b.country ?? '')
    })
  }, [pairs, filterTo, filterFrom])

  const handleSeed = async () => {
    if (!confirm('This will add all default XOF / XAF corridor pairs that are not already present. Continue?')) return
    setSeeding(true)
    setSeedMsg('')
    try {
      const { added, skipped } = await seedDefaultPairs()
      setSeedMsg(`✅ Added ${added} pairs · ${skipped} already existed`)
    } catch (e: any) {
      setSeedMsg('❌ ' + (e?.message ?? 'Failed'))
    } finally {
      setSeeding(false)
    }
  }

  const handleRateChange = async (id: string, rate: number) => {
    await updateCurrencyPair(id, { rate })
  }
  const handleUrgency = async (id: string, urgent: boolean) => {
    await updateCurrencyPair(id, { urgent })
  }
  const handleToggleActive = async (id: string, active: boolean) => {
    await updateCurrencyPair(id, { active })
  }
  const handleDelete = async (id: string) => {
    await deleteCurrencyPair(id)
  }

  // Group header detection
  let lastGroup = ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💱 Currency Pairs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage supported currency conversion corridors</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50 transition-all"
          >
            {seeding ? <span className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full" /> : '🌱'}
            Seed Defaults
          </button>
          <button
            onClick={() => setShowAdd(a => !a)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all"
          >
            {showAdd ? '✕ Cancel' : '+ Add Currency Pair'}
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
          {seedMsg}
        </div>
      )}

      {/* ── Info banner ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">ℹ️ How Currency Pairs Work</p>
        <p className="text-blue-700 leading-relaxed">
          Currency pairs define which conversion corridors are available to customers.
          Each pair represents a <strong>From → To</strong> exchange relationship.
          Each country in the XOF or XAF zone has its own pair with its own rate, since rates differ by corridor.
          Adding a pair enables that conversion in the app immediately.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Pairs" value={stats.active} sub={`${stats.total} total`} color="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-100" />
        <StatCard label="Sending Currencies" value={stats.sendCurrencies} sub="From currencies" color="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100" />
        <StatCard label="XOF Corridors" value={stats.xof} sub="West African CFA" color="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-100" />
        <StatCard label="XAF Corridors" value={stats.xaf} sub="Central African CFA" color="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-100" />
      </div>

      {/* ── Country coverage chips ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">🌍 Country Coverage</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_COUNTRIES.map(c => {
            const hasPair = pairs.some(p => p.countryCode === c.countryCode)
            return (
              <span
                key={c.countryCode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  hasPair
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
                }`}
              >
                <span>{c.flag}</span>
                <span>{c.country}</span>
                <span className={`text-[10px] px-1 rounded font-bold ${c.currency === 'XOF' ? 'text-yellow-700' : 'text-orange-700'}`}>
                  {c.currency}
                </span>
                {hasPair ? <span className="text-green-500">✓</span> : <span className="text-gray-300">○</span>}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Add Pair form ── */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4">Add Currency Pair</h3>
          <AddPairForm onAdded={() => setShowAdd(false)} />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap items-center">
        <span className="text-xs font-semibold text-gray-500">Filter:</span>
        <div className="flex gap-1">
          {['all', 'XOF', 'XAF'].map(f => (
            <button key={f} onClick={() => setFilterTo(f)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                filterTo === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'
              }`}
            >{f === 'all' ? 'All To' : f}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {['all', 'RUB', 'EUR', 'USD', 'GBP'].map(f => (
            <button key={f} onClick={() => setFilterFrom(f)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                filterFrom === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'
              }`}
            >{f === 'all' ? 'All From' : f}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} pairs shown</span>
      </div>

      {/* ── Pairs table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Configured Currency Pairs</h2>
          <p className="text-xs text-gray-400 mt-0.5">All active currency conversion corridors · edit rates inline</p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💱</div>
            <p className="font-medium">No pairs found — click "Seed Defaults" to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Country', 'Corridor', 'Rate', 'Priority', 'Status', ''].map(h => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(pair => {
                  const group = pair.to
                  const showGroupHeader = group !== lastGroup
                  lastGroup = group
                  return (
                    <React.Fragment key={pair.id}>
                      {showGroupHeader && (
                        <tr>
                          <td colSpan={6} className={`py-2 px-4 text-xs font-bold uppercase tracking-widest ${
                            group === 'XOF' ? 'bg-yellow-50 text-yellow-800' : 'bg-orange-50 text-orange-800'
                          }`}>
                            {group === 'XOF' ? '🟡 West African CFA (XOF)' : '🟠 Central African CFA (XAF)'}
                            <span className="ml-2 font-normal normal-case">
                              — {pairs.filter(p => p.to === group).length} corridors
                            </span>
                          </td>
                        </tr>
                      )}
                      <PairRow
                        pair={pair}
                        onRateChange={handleRateChange}
                        onUrgencyToggle={handleUrgency}
                        onToggleActive={handleToggleActive}
                        onDelete={handleDelete}
                      />
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CurrencyPairs
