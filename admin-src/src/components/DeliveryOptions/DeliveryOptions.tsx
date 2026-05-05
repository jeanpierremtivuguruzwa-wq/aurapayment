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
import { Landmark, Smartphone, Banknote, Sprout, Inbox, Search, Plus, Globe, ChevronRight, X, Check } from 'lucide-react'
import { db } from '../../services/firebase'

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
  useCustom: boolean
}

/** One unique destination country derived from currency pairs */
interface DestinationCountry {
  country: string
  countryCode: string
  flag: string
  currency: string   // 'to' currency from the pair (XOF, XAF, GHS, NGN…)
}

// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive provider catalogs — used for dropdown + seeding
// Add any new country here and the dropdown will work automatically
// ─────────────────────────────────────────────────────────────────────────────

const BANK_CATALOG: Record<string, string[]> = {
  // ── West Africa (ECOWAS) ──────────────────────────────────────────────
  BEN: ['Ecobank Bénin', 'BOA Bénin', 'Orabank Bénin', 'SGBBE', 'Coris Bank Bénin', 'Banque Atlantique Bénin'],
  BFA: ['Ecobank Burkina', 'BOA Burkina', 'Coris Bank', 'BICIA-B', 'Orabank Burkina', 'SGBB', 'Banque Atlantique BF'],
  CIV: ['Société Générale CI', 'Ecobank CI', 'BNI', 'BICICI', 'SIB', 'Orabank CI', 'BOA CI', 'NSIA Banque', 'Banque Atlantique CI'],
  GHA: ['GCB Bank', 'Ecobank Ghana', 'Fidelity Bank Ghana', 'Zenith Bank Ghana', 'Absa Ghana', 'UBA Ghana', 'Access Bank Ghana', 'Stanbic Bank Ghana', 'Standard Chartered Ghana', 'First Atlantic Bank', 'Consolidated Bank Ghana'],
  GIN: ['Ecobank Guinée', 'BOA Guinée', 'SGBG', 'Orabank Guinée', 'BIG', 'Banque Atlantique Guinée'],
  GNB: ['Ecobank Guinée-Bissau', 'BRS-GB', 'Orabank Guinée-Bissau'],
  GMB: ['Trust Bank Gambia', 'GTBank Gambia', 'Standard Chartered Gambia', 'Ecobank Gambia', 'Access Bank Gambia'],
  LBR: ['Ecobank Liberia', 'United Bank Liberia', 'LBDI', 'GTBank Liberia', 'Access Bank Liberia'],
  MLI: ['BOA Mali', 'Ecobank Mali', 'Banque Atlantique Mali', 'BDM', 'BNDA', 'Orabank Mali'],
  MRT: ['Chinguetti Bank', 'BCI Mauritanie', 'Attijari Bank Mauritanie', 'BNM'],
  NER: ['Ecobank Niger', 'BOA Niger', 'BIA-Niger', 'Orabank Niger', 'SIB Niger', 'Banque Atlantique Niger'],
  NGA: ['Access Bank', 'First Bank Nigeria', 'GTBank', 'Zenith Bank', 'UBA Nigeria', 'Union Bank', 'Stanbic IBTC', 'Fidelity Bank Nigeria', 'Sterling Bank', 'Polaris Bank', 'Wema Bank', 'Keystone Bank', 'Providus Bank'],
  SEN: ['Société Générale Sénégal', 'CBAO Sénégal', 'BHS', 'BICIS', 'Ecobank Sénégal', 'BNDE', 'Orabank Sénégal', 'Banque Atlantique Sénégal'],
  SLE: ['Rokel Commercial Bank', 'Sierra Leone Commercial Bank', 'Ecobank Sierra Leone', 'GTBank Sierra Leone', 'UBA Sierra Leone'],
  TGO: ['Ecobank Togo', 'ORAGROUP Togo', 'BIA Togo', 'Orabank Togo', 'UTB', 'Banque Atlantique Togo'],
  // ── Central Africa (CEMAC) ────────────────────────────────────────────
  CAF: ['BPCA', 'BGFI Bank RCA', 'Ecobank RCA'],
  CMR: ['Ecobank Cameroun', 'Afriland First Bank', 'SCB Cameroun', 'UBA Cameroun', 'Société Générale Cameroun', 'CCA Bank', 'BGFI Bank Cameroun'],
  COD: ['Ecobank DRC', 'Rawbank', 'TMB', 'Access Bank DRC', 'ProCredit Bank DRC', 'BCDC', 'FBNBank DRC'],
  COG: ['Ecobank Congo', 'LCB Bank', 'BGFI Bank Congo', 'BIAC', 'Orabank Congo'],
  GAB: ['Ecobank Gabon', 'BGFI Bank Gabon', 'BICI-Gabon', 'Orabank Gabon'],
  GNQ: ['CCEI Bank GE', 'BGFI Bank GE'],
  TCD: ['Ecobank Tchad', 'CBLT', 'BGFI Bank Tchad', 'Commercial Bank Tchad'],
  // ── East Africa ───────────────────────────────────────────────────────
  ETH: ['Commercial Bank of Ethiopia', 'Awash Bank', 'Dashen Bank', 'Abyssinia Bank', 'United Bank Ethiopia', 'Nib Bank Ethiopia'],
  KEN: ['Equity Bank Kenya', 'KCB Bank', 'Co-operative Bank Kenya', 'NCBA Bank', 'Absa Kenya', 'Standard Chartered Kenya', 'Diamond Trust Bank', 'I&M Bank Kenya', 'Family Bank Kenya'],
  RWA: ['Bank of Kigali', 'Equity Bank Rwanda', 'Access Bank Rwanda', 'I&M Bank Rwanda', 'Cogebanque', 'BPR Bank Rwanda'],
  TZA: ['CRDB Bank', 'NMB Bank Tanzania', 'Equity Bank Tanzania', 'Stanbic Tanzania', 'Standard Chartered Tanzania', 'NBC Bank Tanzania'],
  UGA: ['Stanbic Uganda', 'dfcu Bank', 'Centenary Bank', 'Equity Bank Uganda', 'Absa Uganda', 'DFCU Bank Uganda'],
  // ── Southern Africa ───────────────────────────────────────────────────
  MOZ: ['BCI Moçambique', 'Standard Bank Mozambique', 'Millennium Bim', 'Moza Banco', 'Absa Mozambique'],
  ZAF: ['Standard Bank SA', 'FNB', 'Absa Bank SA', 'Nedbank', 'Capitec Bank', 'African Bank'],
  ZMB: ['Zanaco', 'First National Bank Zambia', 'Standard Chartered Zambia', 'Absa Zambia', 'Stanbic Zambia', 'Atlas Mara Zambia'],
  ZWE: ['CBZ Bank', 'FBC Bank', 'Stanbic Zimbabwe', 'Standard Chartered Zimbabwe', 'NMB Bank Zimbabwe', 'BancABC Zimbabwe'],
  // ── North Africa ──────────────────────────────────────────────────────
  DZA: ['BNA Algérie', 'BEA', 'CPA', 'BADR', 'Société Générale Algérie', 'BNP Paribas Algérie'],
  EGY: ['National Bank of Egypt', 'Banque Misr', 'Commercial International Bank', 'QNB Egypt', 'Arab Bank Egypt', 'Housing & Development Bank'],
  MAR: ['Attijariwafa Bank', 'BMCE Bank', 'CIH Bank', 'Banque Populaire', 'Société Générale Maroc', 'BMCI', 'Crédit du Maroc'],
  TUN: ['STB', 'BNA Tunisie', 'BIAT', 'Amen Bank', 'Attijari Bank Tunisia', 'UIB', 'BH Bank'],
  // ── Eastern Europe ────────────────────────────────────────────────────
  RUS: ['Sberbank', 'VTB Bank', 'Gazprombank', 'Alfa-Bank', 'Rosselkhozbank', 'Tinkoff Bank', 'Otkritie Bank', 'Sovcombank', 'Raiffeisenbank Russia', 'Promsvyazbank', 'Post Bank Russia', 'UniCredit Russia', 'Rosbank', 'Bank DOM.RF', 'Moscow Credit Bank'],
}

const MOBILE_CATALOG: Record<string, string[]> = {
  // ── West Africa ───────────────────────────────────────────────────────
  BEN: ['MTN Mobile Money', 'Moov Money', 'Celtis Cash'],
  BFA: ['Orange Money', 'Moov Money', 'Coris Money'],
  CIV: ['Orange Money', 'MTN Mobile Money', 'Wave', 'Moov Money'],
  GHA: ['MTN MoMo', 'AirtelTigo Money', 'Telecel Cash', 'Zeepay'],
  GIN: ['Orange Money', 'MTN Mobile Money', 'Africell Money'],
  GNB: ['Orange Money', 'MTN Mobile Money'],
  GMB: ['Afrimoney', 'QMoney Gambia'],
  LBR: ['Orange Money', 'Lonestar Mobile Money'],
  MLI: ['Orange Money', 'Moov Money', 'Sama Money'],
  MRT: ['Mattel Money'],
  NER: ['Airtel Money', 'Moov Money', 'Orange Money'],
  NGA: ['OPay', 'PalmPay', 'Paga', 'Kuda', 'Moniepoint', 'MTN MoMo Nigeria', 'Airtel Money Nigeria'],
  SEN: ['Orange Money', 'Wave', 'Free Money', 'Wari', 'Expresso Cash'],
  SLE: ['Orange Money', 'Africell Money', 'QMoney'],
  TGO: ['T-Money', 'Flooz', 'Moov Money'],
  // ── Central Africa ────────────────────────────────────────────────────
  CAF: ['Orange Money', 'Moov Money'],
  CMR: ['MTN Mobile Money', 'Orange Money', 'Express Union Mobile'],
  COD: ['M-Pesa Congo', 'Airtel Money Congo', 'Orange Money DRC'],
  COG: ['Airtel Money', 'MTN Mobile Money'],
  GAB: ['Airtel Money', 'Moov Money'],
  GNQ: ['Guinea Mobile Money'],
  TCD: ['Airtel Money', 'Moov Money'],
  // ── East Africa ───────────────────────────────────────────────────────
  ETH: ['Telebirr', 'HelloCash', 'M-Birr', 'Amole'],
  KEN: ['M-Pesa', 'Airtel Money Kenya', 'T-Kash'],
  RWA: ['MTN MoMo Rwanda', 'Airtel Money Rwanda'],
  TZA: ['M-Pesa Tanzania', 'Airtel Money Tanzania', 'Tigo Pesa', 'Halotel Pesa'],
  UGA: ['MTN MoMo Uganda', 'Airtel Money Uganda'],
  // ── Southern Africa ───────────────────────────────────────────────────
  MOZ: ['M-Pesa Mozambique', 'mKesh', 'eMola'],
  ZAF: ['MTN MoMo South Africa', 'Vodacom M-Pesa SA'],
  ZMB: ['MTN MoMo Zambia', 'Airtel Money Zambia', 'Zamtel Kwacha'],
  ZWE: ['EcoCash', 'OneMoney', 'Telecash'],
  // ── North Africa ──────────────────────────────────────────────────────
  DZA: ['CCP Mobile', 'Baridi Mob'],
  EGY: ['Vodafone Cash', 'Orange Money Egypt', 'Etisalat Cash', 'Fawry'],
  MAR: ['Orange Money Maroc', 'Inwi Money', 'Maroc Telecom Money'],
  TUN: ['Orange Money Tunisie', 'Ooredoo Money'],
  // ── Eastern Europe ────────────────────────────────────────────────────
  RUS: ['SBP (Fast Payment System)', 'Tinkoff Pay', 'SberPay', 'YooMoney', 'QIWI Wallet', 'VK Pay', 'MTS Money'],
}

// Derive DEFAULT_OPTIONS for seeding from the catalogs (single source of truth)
const DEFAULT_OPTIONS: Record<string, { type: DeliveryType; name: string }[]> = Object.fromEntries(
  Object.entries(BANK_CATALOG).map(([code, banks]) => [
    code,
    [
      ...banks.map(name => ({ type: 'bank' as DeliveryType, name })),
      ...(MOBILE_CATALOG[code] || []).map(name => ({ type: 'mobile' as DeliveryType, name })),
    ],
  ])
)

// ─────────────────────────────────────────────────────────────────────────────
// Static country metadata — authoritative list shown even without Firestore pairs
// ─────────────────────────────────────────────────────────────────────────────
const COUNTRY_META: Record<string, { country: string; flag: string; currency: string }> = {
  // XOF — West African CFA franc
  BEN: { country: 'Benin',          flag: '🇧🇯', currency: 'XOF' },
  BFA: { country: 'Burkina Faso',   flag: '🇧🇫', currency: 'XOF' },
  CIV: { country: "Côte d'Ivoire",  flag: '🇨🇮', currency: 'XOF' },
  GNB: { country: 'Guinea-Bissau',  flag: '🇬🇼', currency: 'XOF' },
  MLI: { country: 'Mali',           flag: '🇲🇱', currency: 'XOF' },
  NER: { country: 'Niger',          flag: '🇳🇪', currency: 'XOF' },
  SEN: { country: 'Senegal',        flag: '🇸🇳', currency: 'XOF' },
  TGO: { country: 'Togo',           flag: '🇹🇬', currency: 'XOF' },
  // XAF — Central African CFA franc
  CAF: { country: 'Central African Rep.', flag: '🇨🇫', currency: 'XAF' },
  CMR: { country: 'Cameroon',             flag: '🇨🇲', currency: 'XAF' },
  COG: { country: 'Republic of Congo',    flag: '🇨🇬', currency: 'XAF' },
  GAB: { country: 'Gabon',               flag: '🇬🇦', currency: 'XAF' },
  GNQ: { country: 'Equatorial Guinea',    flag: '🇬🇶', currency: 'XAF' },
  TCD: { country: 'Chad',                 flag: '🇹🇩', currency: 'XAF' },
  // Eastern Europe
  RUS: { country: 'Russia',         flag: '🇷🇺', currency: 'RUB' },
  // Other major corridors
  GHA: { country: 'Ghana',          flag: '🇬🇭', currency: 'GHS' },
  GIN: { country: 'Guinea',         flag: '🇬🇳', currency: 'GNF' },
  NGA: { country: 'Nigeria',        flag: '🇳🇬', currency: 'NGN' },
  COD: { country: 'DR Congo',       flag: '🇨🇩', currency: 'CDF' },
  SLE: { country: 'Sierra Leone',   flag: '🇸🇱', currency: 'SLL' },
  ETH: { country: 'Ethiopia',       flag: '🇪🇹', currency: 'ETB' },
  KEN: { country: 'Kenya',          flag: '🇰🇪', currency: 'KES' },
  RWA: { country: 'Rwanda',         flag: '🇷🇼', currency: 'RWF' },
  TZA: { country: 'Tanzania',       flag: '🇹🇿', currency: 'TZS' },
  UGA: { country: 'Uganda',         flag: '🇺🇬', currency: 'UGX' },
  MOZ: { country: 'Mozambique',     flag: '🇲🇿', currency: 'MZN' },
  ZMB: { country: 'Zambia',         flag: '🇿🇲', currency: 'ZMW' },
  ZWE: { country: 'Zimbabwe',       flag: '🇿🇼', currency: 'ZWL' },
  MAR: { country: 'Morocco',        flag: '🇲🇦', currency: 'MAD' },
  EGY: { country: 'Egypt',          flag: '🇪🇬', currency: 'EGP' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_META: Record<DeliveryType, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  bank:   { label: 'Bank',         icon: <Landmark className="w-4 h-4" />,    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  mobile: { label: 'Mobile Money', icon: <Smartphone className="w-4 h-4" />, bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
  cash:   { label: 'Cash Pickup',  icon: <Banknote className="w-4 h-4" />,   bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200'     },
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface AddCountryForm {
  countryCode: string
  country: string
  flag: string
  currency: string
}

const REGION_ORDER = ['XOF', 'XAF', 'NGN', 'GHS', 'GNF', 'CDF', 'SLL', 'ETB', 'KES', 'RWF', 'TZS', 'UGX', 'MOZ', 'MZN', 'ZMW', 'ZWL', 'MAD', 'EGP', 'RUB', 'Other']

const REGION_LABEL: Record<string, string> = {
  XOF: 'West Africa (XOF)',
  XAF: 'Central Africa (XAF)',
  NGN: 'Nigeria',
  GHS: 'Ghana',
  GNF: 'Guinea',
  CDF: 'DR Congo',
  SLL: 'Sierra Leone',
  ETB: 'Ethiopia',
  KES: 'Kenya',
  RWF: 'Rwanda',
  TZS: 'Tanzania',
  UGX: 'Uganda',
  MZN: 'Mozambique',
  ZMW: 'Zambia',
  ZWL: 'Zimbabwe',
  MAD: 'Morocco',
  EGP: 'Egypt',
  RUB: 'Russia',
}

const DeliveryOptions: React.FC = () => {
  const [options, setOptions] = useState<DeliveryOption[]>([])
  const [destinations, setDestinations] = useState<DestinationCountry[]>([])
  const [pairsLoading, setPairsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAddCountryModal, setShowAddCountryModal] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [form, setForm] = useState<FormState>({ type: 'bank', name: '', useCustom: false })
  const [addCountryForm, setAddCountryForm] = useState<AddCountryForm>({ countryCode: '', country: '', flag: '', currency: '' })
  const [addCountryErr, setAddCountryErr] = useState('')
  const [savingCountry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  // ── Preset names per country+type (from comprehensive catalogs) ────────
  const presetOptions = useMemo(() => {
    if (!selectedCountryCode) return []
    if (form.type === 'bank')   return BANK_CATALOG[selectedCountryCode]   || []
    if (form.type === 'mobile') return MOBILE_CATALOG[selectedCountryCode] || []
    return []
  }, [selectedCountryCode, form.type])

  const showDropdown = form.type !== 'cash' && presetOptions.length > 0

  // ── Listen to currencyPairs → enrich static country list with live rates ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'currencyPairs'), snap => {
      const liveMap: Record<string, { currency: string; flag: string; country: string }> = {}
      snap.docs.forEach(d => {
        const p = d.data()
        const code = (p.countryCode || '') as string
        if (code && !liveMap[code]) {
          liveMap[code] = {
            currency: p.to || p.currency || '',
            flag:     p.flag || '',
            country:  p.country || '',
          }
        }
      })

      const dests: DestinationCountry[] = Object.entries(COUNTRY_META).map(([code, meta]) => {
        const live = liveMap[code]
        return {
          countryCode: code,
          country:  live?.country  || meta.country,
          flag:     live?.flag     || meta.flag,
          currency: meta.currency  || live?.currency || '',
        }
      })

      dests.sort((a, b) => a.country.localeCompare(b.country))
      setDestinations(dests)
      setSelectedCountryCode(prev => prev || (dests[0]?.countryCode ?? ''))
      setPairsLoading(false)
    })
    return unsub
  }, [])

  // ── Real-time listener for delivery options ─────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'deliveryOptions'), snap => {
      const docs: DeliveryOption[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOption))
      setOptions(docs)
      setLoading(false)
    })
    return unsub
  }, [])

  const selectedRegion = useMemo(
    () => destinations.find(r => r.countryCode === selectedCountryCode),
    [destinations, selectedCountryCode]
  )

  const countryOptions = useMemo(
    () => options.filter(o => o.countryCode === selectedCountryCode),
    [options, selectedCountryCode]
  )

  const countsByType = useMemo(() => ({
    bank:   countryOptions.filter(o => o.type === 'bank').length,
    mobile: countryOptions.filter(o => o.type === 'mobile').length,
    cash:   countryOptions.filter(o => o.type === 'cash').length,
  }), [countryOptions])

  // ── Filtered + grouped destinations for sidebar ─────────────────────────
  const filteredDestinations = useMemo(() => {
    const q = countrySearch.toLowerCase()
    if (!q) return destinations
    return destinations.filter(d =>
      d.country.toLowerCase().includes(q) ||
      d.countryCode.toLowerCase().includes(q) ||
      d.currency.toLowerCase().includes(q)
    )
  }, [destinations, countrySearch])

  const groupedDestinations = useMemo(() => {
    const groups: Record<string, DestinationCountry[]> = {}
    filteredDestinations.forEach(d => {
      const key = d.currency || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    })
    return groups
  }, [filteredDestinations])

  // ── Seed defaults ───────────────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    if (!selectedRegion) return
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
    if (!selectedRegion) return
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
      setForm({ type: 'bank', name: '', useCustom: false })
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

  // ── Add custom country ──────────────────────────────────────────────────
  const handleAddCountry = () => {
    const { countryCode, country, currency } = addCountryForm
    if (!countryCode.trim()) { setAddCountryErr('Country code is required (e.g. GMB)'); return }
    if (!country.trim())     { setAddCountryErr('Country name is required'); return }
    if (!currency.trim())    { setAddCountryErr('Currency code is required (e.g. GMD)'); return }
    const code = countryCode.trim().toUpperCase()
    if (destinations.find(d => d.countryCode === code)) {
      setAddCountryErr(`Country code "${code}" already exists`)
      return
    }
    const newDest: DestinationCountry = {
      countryCode: code,
      country: country.trim(),
      flag: addCountryForm.flag.trim() || '🏳️',
      currency: currency.trim().toUpperCase(),
    }
    setDestinations(prev => [...prev, newDest].sort((a, b) => a.country.localeCompare(b.country)))
    setSelectedCountryCode(code)
    setAddCountryForm({ countryCode: '', country: '', flag: '', currency: '' })
    setAddCountryErr('')
    setShowAddCountryModal(false)
  }

  if (pairsLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Sorted region keys
  const regionKeys = REGION_ORDER.filter(k => groupedDestinations[k])
    .concat(Object.keys(groupedDestinations).filter(k => !REGION_ORDER.includes(k)))

  return (
    <div className="flex flex-col gap-6">

      {/* ══ Page Header ══════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Options</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure banks, mobile money providers and cash pickup per destination country
          </p>
        </div>
      </div>

      {/* ══ Two-column layout ════════════════════════════════════════════ */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT: Country sidebar ─────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col gap-3">

          {/* Search + Add Country */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
                placeholder="Search countries…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
            <button
              onClick={() => { setShowAddCountryModal(true); setAddCountryErr('') }}
              className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors"
              title="Add new country"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Country list grouped by currency region */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {regionKeys.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">No countries match your search</div>
            ) : (
              regionKeys.map(currency => {
                const countries = groupedDestinations[currency]
                const label = REGION_LABEL[currency] || currency
                return (
                  <div key={currency}>
                    {/* Region header */}
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
                    </div>
                    {/* Countries */}
                    {countries.map(r => {
                      const count = options.filter(o => o.countryCode === r.countryCode).length
                      const isSelected = selectedCountryCode === r.countryCode
                      return (
                        <button
                          key={r.countryCode}
                          onClick={() => setSelectedCountryCode(r.countryCode)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors text-left ${
                            isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-lg leading-none">{r.flag || '🏳️'}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                              {r.country}
                            </p>
                            <p className="text-xs text-gray-400">{r.currency}</p>
                          </div>
                          {count > 0 && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                              isSelected ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-100 text-gray-500'
                            }`}>{count}</span>
                          )}
                          {isSelected && <ChevronRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">{destinations.length} countries total</p>
        </div>

        {/* ── RIGHT: Options panel ───────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedRegion ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <Globe className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-medium">Select a country to manage its delivery options</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* Country header card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{selectedRegion.flag || '🏳️'}</span>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedRegion.country}</h2>
                      <p className="text-sm text-gray-400">{selectedRegion.currency} · {selectedRegion.countryCode}</p>
                    </div>
                    {/* Summary badges */}
                    <div className="flex gap-2 flex-wrap ml-2">
                      {(Object.entries(countsByType) as [DeliveryType, number][]).filter(([,c]) => c > 0).map(([type, count]) => {
                        const m = TYPE_META[type]
                        return (
                          <span key={type} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${m.bg} ${m.text} ${m.border}`}>
                            {m.icon}<span>{count} {m.label}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSeedDefaults}
                      disabled={seeding || !selectedRegion}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
                    >
                      <Sprout className="w-4 h-4" />
                      {seeding ? 'Seeding…' : 'Seed Defaults'}
                    </button>
                    <button
                      onClick={() => { setShowAddModal(true); setFormErr('') }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Option
                    </button>
                  </div>
                </div>
              </div>

              {/* Options by type */}
              {countryOptions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                  <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-medium">No delivery options yet</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Click <strong>Seed Defaults</strong> to add common banks & mobile wallets, or <strong>Add Option</strong> to create one manually.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {(['bank', 'mobile', 'cash'] as DeliveryType[]).map(type => {
                    const items = grouped[type]
                    if (items.length === 0) return null
                    const m = TYPE_META[type]
                    return (
                      <div key={type} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Section header */}
                        <div className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 ${m.bg}`}>
                          <span className={m.text}>{m.icon}</span>
                          <h3 className={`font-semibold text-sm ${m.text}`}>{m.label}</h3>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 ${m.text}`}>
                            {items.length}
                          </span>
                        </div>
                        {/* Option rows */}
                        {items.map((opt, idx) => (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between px-5 py-3 transition-colors ${
                              idx < items.length - 1 ? 'border-b border-gray-50' : ''
                            } ${opt.active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`${m.text} shrink-0`}>{m.icon}</span>
                              <p className="font-medium text-gray-800 text-sm truncate">{opt.name}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-4">
                              <span className={`text-xs font-medium ${opt.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                                {opt.active ? 'Active' : 'Disabled'}
                              </span>
                              {/* Toggle */}
                              <button
                                onClick={() => handleToggle(opt)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${opt.active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                title={opt.active ? 'Disable' : 'Enable'}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${opt.active ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(opt.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                title="Delete"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Add Delivery Option Modal ═════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Add Delivery Option</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedRegion?.flag} {selectedRegion?.country} · {selectedRegion?.currency}
                </p>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setForm(f => ({ ...f, name: '', useCustom: false })); setFormErr('') }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bank', 'mobile', 'cash'] as DeliveryType[]).map(type => {
                    const m = TYPE_META[type]
                    return (
                      <button
                        key={type}
                        onClick={() => setForm(f => ({ ...f, type, name: '', useCustom: false }))}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all ${
                          form.type === type
                            ? `${m.bg} ${m.text} ${m.border} shadow-sm ring-1 ring-inset ${m.border}`
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {form.type === 'bank' ? 'Bank Name' : form.type === 'mobile' ? 'Provider Name' : 'Location Name'}
                </label>

                {showDropdown && !form.useCustom ? (
                  <div className="space-y-2">
                    <select
                      value={form.name}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setForm(f => ({ ...f, name: '', useCustom: true }))
                        } else {
                          setForm(f => ({ ...f, name: e.target.value }))
                        }
                        setFormErr('')
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    >
                      <option value="">— Select a {form.type === 'bank' ? 'bank' : 'provider'} —</option>
                      {presetOptions.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="__custom__">＋ Enter custom name…</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.useCustom && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, name: '', useCustom: false }))}
                        className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                      >
                        ← Back to list
                      </button>
                    )}
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErr('') }}
                      placeholder={
                        form.type === 'bank' ? 'e.g. Ecobank Bénin' :
                        form.type === 'mobile' ? 'e.g. MTN Mobile Money' :
                        'e.g. Dakar Main Branch'
                      }
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      autoFocus
                    />
                  </div>
                )}

                {formErr && (
                  <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                    <X className="w-3 h-3" />{formErr}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setShowAddModal(false); setForm(f => ({ ...f, name: '', useCustom: false })); setFormErr('') }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                ) : (
                  <><Check className="w-4 h-4" />Save Option</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Country Modal ═════════════════════════════════════════════ */}
      {showAddCountryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Add New Country</h3>
                <p className="text-xs text-gray-400 mt-0.5">Add a destination country not in the list</p>
              </div>
              <button
                onClick={() => { setShowAddCountryModal(false); setAddCountryErr(''); setAddCountryForm({ countryCode: '', country: '', flag: '', currency: '' }) }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Country code */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    ISO Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={addCountryForm.countryCode}
                    onChange={e => { setAddCountryForm(f => ({ ...f, countryCode: e.target.value.toUpperCase() })); setAddCountryErr('') }}
                    placeholder="e.g. GMB"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <p className="text-xs text-gray-400 mt-1">3-letter ISO code</p>
                </div>
                {/* Flag emoji */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Flag Emoji
                  </label>
                  <input
                    type="text"
                    value={addCountryForm.flag}
                    onChange={e => setAddCountryForm(f => ({ ...f, flag: e.target.value }))}
                    placeholder="🇬🇲"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-center text-xl"
                  />
                  <p className="text-xs text-gray-400 mt-1">Optional</p>
                </div>
              </div>

              {/* Country name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Country Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={addCountryForm.country}
                  onChange={e => { setAddCountryForm(f => ({ ...f, country: e.target.value })); setAddCountryErr('') }}
                  placeholder="e.g. Gambia"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Currency Code <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={addCountryForm.currency}
                  onChange={e => { setAddCountryForm(f => ({ ...f, currency: e.target.value.toUpperCase() })); setAddCountryErr('') }}
                  placeholder="e.g. GMD"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <p className="text-xs text-gray-400 mt-1">3-letter ISO currency code</p>
              </div>

              {addCountryErr && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <X className="w-3 h-3" />{addCountryErr}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setShowAddCountryModal(false); setAddCountryErr(''); setAddCountryForm({ countryCode: '', country: '', flag: '', currency: '' }) }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCountry}
                disabled={savingCountry}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {savingCountry ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding…</>
                ) : (
                  <><Globe className="w-4 h-4" />Add Country</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeliveryOptions
