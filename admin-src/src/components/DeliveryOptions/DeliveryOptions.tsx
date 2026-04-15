import React, { useEffect, useMemo, useState } from 'react'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../services/firebase'

// ─────────────────────────────────────────────────────────────────────────────
// Static reference data (mirrors CurrencyPairs)
// ─────────────────────────────────────────────────────────────────────────────

const XOF_COUNTRIES = [
  { country: 'Benin',         countryCode: 'BEN', flag: '🇧🇯', currency: 'XOF' },
  { country: 'Burkina Faso',  countryCode: 'BFA', flag: '🇧🇫', currency: 'XOF' },
  { country: "Côte d'Ivoire", countryCode: 'CIV', flag: '🇨🇮', currency: 'XOF' },
  { country: 'Guinea-Bissau', countryCode: 'GNB', flag: '🇬🇼', currency: 'XOF' },
  { country: 'Mali',          countryCode: 'MLI', flag: '🇲🇱', currency: 'XOF' },
  { country: 'Niger',         countryCode: 'NER', flag: '🇳🇪', currency: 'XOF' },
  { country: 'Senegal',       countryCode: 'SEN', flag: '🇸🇳', currency: 'XOF' },
  { country: 'Togo',          countryCode: 'TGO', flag: '🇹🇬', currency: 'XOF' },
]

const XAF_COUNTRIES = [
  { country: 'Cameroon',             countryCode: 'CMR', flag: '🇨🇲', currency: 'XAF' },
  { country: 'Central African Rep.', countryCode: 'CAF', flag: '🇨🇫', currency: 'XAF' },
  { country: 'Chad',                 countryCode: 'TCD', flag: '🇹🇩', currency: 'XAF' },
  { country: 'Republic of Congo',    countryCode: 'COG', flag: '🇨🇬', currency: 'XAF' },
  { country: 'Equatorial Guinea',    countryCode: 'GNQ', flag: '🇬🇶', currency: 'XAF' },
  { country: 'Gabon',                countryCode: 'GAB', flag: '🇬🇦', currency: 'XAF' },
]

const OTHER_CURRENCIES = [
  { country: 'Russia',        countryCode: 'RUS', flag: '🇷🇺', currency: 'RUB' },
  { country: 'United States', countryCode: 'USA', flag: '🇺🇸', currency: 'USD' },
  { country: 'European Union',countryCode: 'EUR', flag: '🇪🇺', currency: 'EUR' },
]

const ALL_REGIONS = [...XOF_COUNTRIES, ...XAF_COUNTRIES, ...OTHER_CURRENCIES]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DeliveryType = 'bank' | 'mobile' | 'cash'

interface DeliveryOption {
  id: string
  type: DeliveryType
  name: string
  countryCode: string
  country: string
  currency: string
  flag: string
  active: boolean
  createdAt?: any
}

interface FormState {
  type: DeliveryType
  name: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed defaults per country
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Record<string, { type: DeliveryType; name: string }[]> = {
  BEN: [
    { type: 'bank',   name: 'Ecobank Bénin' },
    { type: 'bank',   name: 'BCEAO' },
    { type: 'bank',   name: 'BOA Bénin' },
    { type: 'mobile', name: 'MTN Mobile Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  BFA: [
    { type: 'bank',   name: 'Ecobank Burkina' },
    { type: 'mobile', name: 'Orange Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  CIV: [
    { type: 'bank',   name: 'Société Générale CI' },
    { type: 'mobile', name: 'Orange Money' },
    { type: 'mobile', name: 'MTN Mobile Money' },
    { type: 'mobile', name: 'Wave' },
  ],
  GNB: [
    { type: 'bank',   name: 'Ecobank Guinée-Bissau' },
    { type: 'mobile', name: 'Orange Money' },
  ],
  MLI: [
    { type: 'bank',   name: 'Banque Malienne' },
    { type: 'mobile', name: 'Orange Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  NER: [
    { type: 'bank',   name: 'Ecobank Niger' },
    { type: 'mobile', name: 'Airtel Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  SEN: [
    { type: 'bank',   name: 'Société Générale Sénégal' },
    { type: 'bank',   name: 'BCEAO Dakar' },
    { type: 'mobile', name: 'Orange Money' },
    { type: 'mobile', name: 'Wave' },
    { type: 'mobile', name: 'Free Money' },
  ],
  TGO: [
    { type: 'bank',   name: 'Ecobank Togo' },
    { type: 'mobile', name: 'T-Money' },
    { type: 'mobile', name: 'Flooz' },
  ],
  CMR: [
    { type: 'bank',   name: 'Ecobank Cameroun' },
    { type: 'bank',   name: 'Afriland First Bank' },
    { type: 'mobile', name: 'MTN Mobile Money' },
    { type: 'mobile', name: 'Orange Money' },
  ],
  CAF: [
    { type: 'bank',   name: 'BPCA' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  TCD: [
    { type: 'bank',   name: 'Ecobank Tchad' },
    { type: 'mobile', name: 'Airtel Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
  COG: [
    { type: 'bank',   name: 'Ecobank Congo' },
    { type: 'mobile', name: 'Airtel Money' },
    { type: 'mobile', name: 'MTN Mobile Money' },
  ],
  GNQ: [
    { type: 'bank',   name: 'CCEI Bank GE' },
    { type: 'mobile', name: 'Guinea Money' },
  ],
  GAB: [
    { type: 'bank',   name: 'Ecobank Gabon' },
    { type: 'mobile', name: 'Airtel Money' },
    { type: 'mobile', name: 'Moov Money' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_META: Record<DeliveryType, { label: string; icon: string; bg: string; text: string; border: string }> = {
  bank:   { label: 'Bank',         icon: '🏦', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  mobile: { label: 'Mobile Money', icon: '📱', bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
  cash:   { label: 'Cash Pickup',  icon: '💵', bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200'     },
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DeliveryOptions: React.FC = () => {
  const [options, setOptions] = useState<DeliveryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('BEN')
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<FormState>({ type: 'bank', name: '' })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  // ── Real-time listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'deliveryOptions'), snap => {
      const docs: DeliveryOption[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOption))
      setOptions(docs)
      setLoading(false)
    })
    return unsub
  }, [])

  // ── Selected region ─────────────────────────────────────────────────────
  const selectedRegion = useMemo(
    () => ALL_REGIONS.find(r => r.countryCode === selectedCountryCode)!,
    [selectedCountryCode]
  )

  // ── Options for selected country ────────────────────────────────────────
  const countryOptions = useMemo(
    () => options.filter(o => o.countryCode === selectedCountryCode),
    [options, selectedCountryCode]
  )

  const countsByType = useMemo(() => ({
    bank:   countryOptions.filter(o => o.type === 'bank').length,
    mobile: countryOptions.filter(o => o.type === 'mobile').length,
    cash:   countryOptions.filter(o => o.type === 'cash').length,
  }), [countryOptions])

  // ── Seed defaults ───────────────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    const defaults = DEFAULT_OPTIONS[selectedCountryCode]
    if (!defaults || defaults.length === 0) {
      alert('No default options defined for this country yet.')
      return
    }
    if (!confirm(`Seed ${defaults.length} default options for ${selectedRegion.country}?`)) return
    setSeeding(true)
    try {
      for (const d of defaults) {
        const alreadyExists = countryOptions.some(
          o => o.type === d.type && o.name.toLowerCase() === d.name.toLowerCase()
        )
        if (!alreadyExists) {
          await addDoc(collection(db, 'deliveryOptions'), {
            type: d.type,
            name: d.name,
            countryCode: selectedRegion.countryCode,
            country: selectedRegion.country,
            currency: selectedRegion.currency,
            flag: selectedRegion.flag,
            active: true,
            createdAt: serverTimestamp(),
          })
        }
      }
    } catch (err: any) {
      alert('Error seeding: ' + err?.message)
    } finally {
      setSeeding(false)
    }
  }

  // ── Add option ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.name.trim()) { setFormErr('Name is required'); return }
    setSaving(true)
    setFormErr('')
    try {
      await addDoc(collection(db, 'deliveryOptions'), {
        type: form.type,
        name: form.name.trim(),
        countryCode: selectedRegion.countryCode,
        country: selectedRegion.country,
        currency: selectedRegion.currency,
        flag: selectedRegion.flag,
        active: true,
        createdAt: serverTimestamp(),
      })
      setForm({ type: 'bank', name: '' })
      setShowAddModal(false)
    } catch (err: any) {
      setFormErr(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────
  const handleToggle = async (option: DeliveryOption) => {
    try {
      await updateDoc(doc(db, 'deliveryOptions', option.id), { active: !option.active })
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this delivery option?')) return
    try {
      await deleteDoc(doc(db, 'deliveryOptions', id))
    } catch (err: any) {
      alert('Error: ' + err?.message)
    }
  }

  // ── Group by type for display ───────────────────────────────────────────
  const grouped: Record<DeliveryType, DeliveryOption[]> = {
    bank:   countryOptions.filter(o => o.type === 'bank'),
    mobile: countryOptions.filter(o => o.type === 'mobile'),
    cash:   countryOptions.filter(o => o.type === 'cash'),
  }

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Options</h1>
          <p className="text-gray-500 text-sm mt-1">Manage banks, mobile money providers, and cash pickup locations</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
          >
            {seeding ? '...' : '🌱'} Seed Defaults
          </button>
          <button
            onClick={() => { setShowAddModal(true); setFormErr('') }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            + Add Option
          </button>
        </div>
      </div>

      {/* ── Country / Currency selector ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Currency / Country</p>

        {/* XOF */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">XOF — West African CFA</p>
          <div className="flex flex-wrap gap-2">
            {XOF_COUNTRIES.map(r => {
              const count = options.filter(o => o.countryCode === r.countryCode).length
              return (
                <button
                  key={r.countryCode}
                  onClick={() => setSelectedCountryCode(r.countryCode)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                    selectedCountryCode === r.countryCode
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <span>{r.flag}</span>
                  <span>{r.country}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      selectedCountryCode === r.countryCode ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* XAF */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">XAF — Central African CFA</p>
          <div className="flex flex-wrap gap-2">
            {XAF_COUNTRIES.map(r => {
              const count = options.filter(o => o.countryCode === r.countryCode).length
              return (
                <button
                  key={r.countryCode}
                  onClick={() => setSelectedCountryCode(r.countryCode)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                    selectedCountryCode === r.countryCode
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <span>{r.flag}</span>
                  <span>{r.country}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      selectedCountryCode === r.countryCode ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Other */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Other currencies</p>
          <div className="flex flex-wrap gap-2">
            {OTHER_CURRENCIES.map(r => {
              const count = options.filter(o => o.countryCode === r.countryCode).length
              return (
                <button
                  key={r.countryCode}
                  onClick={() => setSelectedCountryCode(r.countryCode)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                    selectedCountryCode === r.countryCode
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <span>{r.flag}</span>
                  <span className="font-semibold">{r.currency}</span>
                  <span className="text-gray-400 font-normal">{r.country}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      selectedCountryCode === r.countryCode ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Selected country summary ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">{selectedRegion.flag}</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{selectedRegion.country}</h2>
            <p className="text-sm text-gray-500">{selectedRegion.currency} · {selectedRegion.countryCode}</p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-3 flex-wrap mb-6">
          {(Object.entries(countsByType) as [DeliveryType, number][]).map(([type, count]) => {
            const m = TYPE_META[type]
            return (
              <div key={type} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${m.bg} ${m.border}`}>
                <span>{m.icon}</span>
                <span className={`font-semibold text-sm ${m.text}`}>{m.label}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70 ${m.text}`}>({count})</span>
              </div>
            )
          })}
        </div>

        {/* Groups */}
        {countryOptions.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No delivery options configured</p>
            <p className="text-gray-400 text-sm mt-1">Click "Seed Defaults" to add common options, or "Add Option" to create one manually.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {(['bank', 'mobile', 'cash'] as DeliveryType[]).map(type => {
              const items = grouped[type]
              if (items.length === 0) return null
              const m = TYPE_META[type]
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span>{m.icon}</span>
                    <h3 className="font-semibold text-gray-700">{m.label}</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.text} ${m.border}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map(opt => (
                      <div
                        key={opt.id}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                          opt.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-150 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{m.icon}</span>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{opt.name}</p>
                            <p className="text-xs text-gray-400">{opt.type} · {opt.countryCode}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Active toggle */}
                          <button
                            onClick={() => handleToggle(opt)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              opt.active ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                            title={opt.active ? 'Disable' : 'Enable'}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                              opt.active ? 'left-5' : 'left-0.5'
                            }`} />
                          </button>
                          <span className={`text-xs font-medium w-14 ${opt.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {opt.active ? 'Active' : 'Disabled'}
                          </span>
                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(opt.id)}
                            className="ml-2 text-red-400 hover:text-red-600 transition-colors text-lg leading-none"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add Option Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Add Delivery Option</h3>
              <button
                onClick={() => { setShowAddModal(false); setFormErr('') }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Country (read-only) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Country</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700">
                  <span>{selectedRegion.flag}</span>
                  <span>{selectedRegion.country}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold">{selectedRegion.currency}</span>
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type</label>
                <div className="flex gap-2">
                  {(['bank', 'mobile', 'cash'] as DeliveryType[]).map(type => {
                    const m = TYPE_META[type]
                    return (
                      <button
                        key={type}
                        onClick={() => setForm(f => ({ ...f, type }))}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                          form.type === type
                            ? `${m.bg} ${m.text} ${m.border} shadow-sm`
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErr('') }}
                  placeholder={
                    form.type === 'bank' ? 'e.g. Ecobank Bénin' :
                    form.type === 'mobile' ? 'e.g. MTN Mobile Money' :
                    'e.g. Dakar Agency'
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                {formErr && <p className="text-red-500 text-xs mt-1">{formErr}</p>}
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => { setShowAddModal(false); setFormErr('') }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Option'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeliveryOptions
