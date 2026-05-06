import React, { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  orderBy, query, setDoc, Timestamp,
} from 'firebase/firestore'
import { ref as storageRef, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../services/firebase'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Clock, Ban,
  XCircle, CheckCircle, Eye, RefreshCw, Play, Search,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Verdict = 'approved' | 'needs_review' | 'suspicious' | 'urgent' | 'cancel_recommended'
type Urgency = 'low' | 'medium' | 'high' | 'critical'

interface MatchField {
  value: string
  match: boolean | 'unknown'
}

interface ProofReview {
  id: string               // orderId
  orderId: string
  userEmail?: string
  verdict: Verdict
  urgency: Urgency
  confidence: number
  explanation: string
  imageAnalysis: string
  amountMatch: MatchField
  recipientMatch: MatchField
  senderMatch: MatchField
  recommendedAction: string
  cancelReason?: string
  summaryForUser: string
  reviewedAt: Timestamp | null
  sendAmount?: number
  sendCurrency?: string
  receiveCurrency?: string
}

interface OrderRec {
  id: string
  orderId?: string
  proofFileName?: string
  sendAmount?: number
  sendCurrency?: string
  receiveCurrency?: string
  recipientName?: string
  senderName?: string
  userEmail?: string
  paymentMethod?: string
  status?: string
  createdAt?: { seconds: number } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VERDICT_META: Record<Verdict, {
  label: string; color: string; bg: string; border: string; Icon: React.ElementType
}> = {
  approved:           { label: 'Approved',           color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', Icon: ShieldCheck  },
  needs_review:       { label: 'Needs Review',       color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-200',   Icon: Eye          },
  suspicious:         { label: 'Suspicious',         color: 'text-orange-700',  bg: 'bg-orange-100',  border: 'border-orange-200',  Icon: AlertTriangle },
  urgent:             { label: 'Urgent',             color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-200',     Icon: ShieldAlert  },
  cancel_recommended: { label: 'Cancel Recommended', color: 'text-rose-800',    bg: 'bg-rose-100',    border: 'border-rose-200',    Icon: Ban          },
}

const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-emerald-700', bg: 'bg-emerald-100' },
  medium:   { label: 'Medium',   color: 'text-amber-700',   bg: 'bg-amber-100'   },
  high:     { label: 'High',     color: 'text-orange-700',  bg: 'bg-orange-100'  },
  critical: { label: 'Critical', color: 'text-red-700',     bg: 'bg-red-100'     },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n = 14) {
  return s.length > n ? s.slice(0, n) + '...' : s
}

function fmtDate(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Invalid Date'
  try { return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return 'Invalid Date' }
}

async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const blob = await res.blob()
  const mimeType = blob.type || 'image/jpeg'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(',')[1]
      resolve({ data: b64, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function callGeminiVision(
  apiKey: string,
  imageB64: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageB64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
      }),
    }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${res.status}: ${txt}`)
  }
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function buildVisionPrompt(order: OrderRec, expectedCardholderName: string): string {
  return `You are an AI payment proof validator. Analyze this payment receipt image and compare it against the expected transaction data below.

EXPECTED TRANSACTION:
- Amount to pay: ${order.sendAmount ?? '?'} ${order.sendCurrency ?? '?'}
- Expected cardholder name: ${expectedCardholderName || order.recipientName || 'N/A'}
- Receive currency: ${order.receiveCurrency ?? '?'}
- Sender: ${order.senderName || order.userEmail || 'N/A'}

Return ONLY a valid JSON object with no markdown fences, no extra text:
{
  "verdict": "approved" | "needs_review" | "suspicious" | "urgent" | "cancel_recommended",
  "urgency": "low" | "medium" | "high" | "critical",
  "confidence": <integer 0-100>,
  "explanation": "<one sentence summary of verdict reason>",
  "imageAnalysis": "<detailed description of everything visible in the proof image>",
  "amountMatch": {
    "value": "<amount + currency visible in image, e.g. '20,000 RWF'>",
    "match": true | false
  },
  "recipientMatch": {
    "value": "<recipient name visible in image>",
    "match": true | false
  },
  "senderMatch": {
    "value": "<sender name visible in image, or 'Unknown' if not visible>",
    "match": true | false | "unknown"
  },
  "recommendedAction": "<action for the agent, e.g. 'Verify the currency and amount with the user.'>",
  "cancelReason": "<reason to cancel, or empty string if not recommended>",
  "summaryForUser": "<message to send to the user explaining what was found>"
}

Rules:
- verdict 'approved': all fields match exactly
- verdict 'needs_review': partial match or ambiguous data
- verdict 'suspicious': clear mismatch in amount/currency but name matches, or suspicious editing
- verdict 'urgent': serious fraud indicators, manipulated image, or complete mismatch
- verdict 'cancel_recommended': transaction should be cancelled — amount AND currency wrong, or clear fraud
- Set confidence 100 only if everything verifiably matches
- For senderMatch.match use "unknown" if sender is not visible in the image`
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: number
  color?: string
}> = ({ icon, label, value, color = 'text-slate-700' }) => (
  <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
    <div className="text-slate-400">{icon}</div>
    <div>
      <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
    </div>
  </div>
)

// ── Match Field Display ───────────────────────────────────────────────────────

const MatchChip: React.FC<{ label: string; value: string; match: boolean | 'unknown' }> = ({ label, value, match }) => (
  <div className="flex-1 min-w-[140px] border border-slate-200 rounded-lg px-3 py-2.5">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
    <div className="flex items-center gap-1.5">
      {match === true  && <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />}
      {match === false && <XCircle     size={13} className="text-red-500 flex-shrink-0"     />}
      {match === 'unknown' && <span className="w-3 h-3 rounded-full border-2 border-slate-300 flex-shrink-0" />}
      <span className={`text-sm font-semibold ${match === true ? 'text-emerald-700' : match === false ? 'text-red-600' : 'text-slate-500'}`}>
        {value || '—'}
      </span>
      {match === 'unknown' && <span className="text-xs text-slate-400">not visible</span>}
    </div>
  </div>
)

// ── Review Card ───────────────────────────────────────────────────────────────

const ReviewCard: React.FC<{ review: ProofReview }> = ({ review }) => {
  const [open, setOpen] = useState(false)
  const vm = VERDICT_META[review.verdict]
  const um = URGENCY_META[review.urgency]
  const VIcon = vm.Icon

  const showCancelBanner = review.verdict === 'cancel_recommended' || review.verdict === 'urgent'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${review.verdict === 'urgent' ? 'border-red-200' : review.verdict === 'cancel_recommended' ? 'border-rose-200' : 'border-slate-200'}`}>

      {/* ── Collapsed header ── */}
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Icon */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${vm.bg}`}>
          <VIcon size={16} className={vm.color} strokeWidth={2} />
        </div>

        {/* ID + snippet */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-slate-700">
              {trunc(review.orderId || review.id, 10)}…
            </span>
            {/* Verdict badge */}
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${vm.bg} ${vm.color} ${vm.border} border`}>
              <VIcon size={11} strokeWidth={2} />
              {vm.label}
            </span>
            {/* Cancel button style badge */}
            {showCancelBanner && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500 text-white">
                <Ban size={10} strokeWidth={2.5} /> Cancel
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{review.explanation}</p>
        </div>

        {/* Urgency + confidence */}
        <div className="flex-shrink-0 text-right hidden sm:block ml-2">
          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-md ${um.bg} ${um.color}`}>
            {um.label}
          </span>
          <p className="text-xs text-slate-400 mt-1">{review.confidence}% confident</p>
        </div>

        {open
          ? <ChevronUp   size={16} className="text-slate-400 flex-shrink-0 ml-1" />
          : <ChevronDown size={16} className="text-slate-400 flex-shrink-0 ml-1" />
        }
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-4 bg-slate-50/60">

          {/* AI Image Analysis */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">AI Image Analysis</p>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed">
              {review.imageAnalysis || <span className="text-slate-400 italic">No image analysis available.</span>}
            </div>
          </div>

          {/* Match chips */}
          <div className="flex flex-wrap gap-3">
            <MatchChip
              label="Amount Match"
              value={review.amountMatch?.value ?? '—'}
              match={review.amountMatch?.match ?? 'unknown'}
            />
            <MatchChip
              label="Recipient Match"
              value={review.recipientMatch?.value ?? '—'}
              match={review.recipientMatch?.match ?? 'unknown'}
            />
            <MatchChip
              label="Sender Match"
              value={review.senderMatch?.value ?? 'Unknown'}
              match={review.senderMatch?.match ?? 'unknown'}
            />
          </div>

          {/* Recommended Action */}
          {review.recommendedAction && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-indigo-700 mb-1">Recommended Action</p>
              <p className="text-sm text-indigo-800 leading-relaxed">{review.recommendedAction}</p>
            </div>
          )}

          {/* AI Recommends Cancellation */}
          {(showCancelBanner || review.cancelReason) && review.cancelReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-700 mb-1">AI Recommends Cancellation</p>
              <p className="text-sm text-red-700 leading-relaxed">{review.cancelReason}</p>
            </div>
          )}

          {/* Summary for User */}
          {review.summaryForUser && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Summary for User</p>
              <p className="text-sm text-slate-500 italic leading-relaxed">{review.summaryForUser}</p>
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <a
              href={`/admin/index.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <ExternalLink size={12} strokeWidth={2} />
              View Transaction
            </a>
            <span className="text-xs text-slate-400">· {fmtDate(review.reviewedAt)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const AIProofMonitor: React.FC = () => {
  const [reviews, setReviews]             = useState<ProofReview[]>([])
  const [running, setRunning]             = useState(false)
  const [progress, setProgress]           = useState({ done: 0, total: 0 })
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [verdictFilter, setVerdictFilter] = useState<Verdict | 'all'>('all')
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>('all')

  // ── Live reviews ───────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'proofReviews'), orderBy('reviewedAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProofReview)))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // ── Run AI Review ──────────────────────────────────────────────────────────
  const handleRunReview = async () => {
    setError(null)
    setRunning(true)
    try {
      // 1. Get Gemini API key
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'main'))
      const geminiKey: string = settingsSnap.data()?.geminiKey ?? ''
      if (!geminiKey) {
        setError('Gemini API key not set. Add "geminiKey" to Firestore appSettings/main.')
        return
      }

      // 2. Fetch all orders that have a proof uploaded
      const ordersSnap = await getDocs(collection(db, 'orders'))
      const ordersWithProof = ordersSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as OrderRec))
        .filter(o => !!o.proofFileName)

      if (ordersWithProof.length === 0) {
        setError('No orders with uploaded proofs found.')
        return
      }

      // Load payment methods once for cardholder name lookup
      const pmSnap = await getDocs(collection(db, 'paymentMethods'))
      const pmMap: Record<string, { name: string; accountHolder?: string }> = {}
      pmSnap.docs.forEach(d => { pmMap[d.id] = d.data() as { name: string; accountHolder?: string } })

      // Load cardholders once for expected name lookup
      const chSnap = await getDocs(collection(db, 'cardholders'))
      const cardholderByPm: Record<string, string> = {}
      chSnap.docs.forEach(d => {
        const ch = d.data()
        if (ch.paymentMethodId) {
          cardholderByPm[ch.paymentMethodId] = ch.accountHolder || ch.displayName || ''
        }
      })

      setProgress({ done: 0, total: ordersWithProof.length })

      // 3. Analyse each order
      for (let i = 0; i < ordersWithProof.length; i++) {
        const order = ordersWithProof[i]

        // Resolve expected cardholder name
        const expectedCardholderName =
          (order.paymentMethod && cardholderByPm[order.paymentMethod])
          || order.recipientName
          || pmMap[order.paymentMethod ?? '']?.accountHolder
          || ''

        let review: Omit<ProofReview, 'id'> = {
          orderId:         order.orderId || order.id,
          userEmail:       order.userEmail,
          verdict:         'needs_review',
          urgency:         'medium',
          confidence:      0,
          explanation:     'AI temporarily unavailable. Manual review required.',
          imageAnalysis:   '',
          amountMatch:     { value: '', match: false },
          recipientMatch:  { value: '', match: false },
          senderMatch:     { value: 'Unknown', match: 'unknown' },
          recommendedAction: '',
          cancelReason:    '',
          summaryForUser:  '',
          reviewedAt:      Timestamp.now(),
          sendAmount:      order.sendAmount,
          sendCurrency:    order.sendCurrency,
          receiveCurrency: order.receiveCurrency,
        }

        try {
          // Get proof download URL
          const url = await getDownloadURL(storageRef(storage, `proofs/${order.proofFileName}`))

          // Convert to base64 for Gemini inline data
          const { data: b64, mimeType } = await imageUrlToBase64(url)

          // Call Gemini Vision
          const prompt = buildVisionPrompt(order, expectedCardholderName)
          const raw = await callGeminiVision(geminiKey, b64, mimeType, prompt)

          // Parse response
          const cleaned = raw.replace(/```json|```/g, '').trim()
          const parsed  = JSON.parse(cleaned)

          review = {
            ...review,
            verdict:          parsed.verdict         ?? 'needs_review',
            urgency:          parsed.urgency          ?? 'medium',
            confidence:       Number(parsed.confidence) || 0,
            explanation:      parsed.explanation      ?? '',
            imageAnalysis:    parsed.imageAnalysis    ?? '',
            amountMatch:      parsed.amountMatch      ?? { value: '', match: false },
            recipientMatch:   parsed.recipientMatch   ?? { value: '', match: false },
            senderMatch:      parsed.senderMatch      ?? { value: 'Unknown', match: 'unknown' },
            recommendedAction: parsed.recommendedAction ?? '',
            cancelReason:     parsed.cancelReason     ?? '',
            summaryForUser:   parsed.summaryForUser   ?? '',
            reviewedAt:       Timestamp.now(),
          }
        } catch (e) {
          review.explanation = `AI temporarily unavailable (${(e as Error).message}). Manual review required.`
        }

        await setDoc(doc(db, 'proofReviews', order.id), review)
        setProgress({ done: i + 1, total: ordersWithProof.length })

        // Rate limit pause
        if (i < ordersWithProof.length - 1) await new Promise(r => setTimeout(r, 400))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  // ── Filter + search ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...reviews]
    if (verdictFilter !== 'all') list = list.filter(r => r.verdict === verdictFilter)
    if (urgencyFilter !== 'all') list = list.filter(r => r.urgency === urgencyFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.orderId || r.id).toLowerCase().includes(q) ||
        r.explanation.toLowerCase().includes(q) ||
        (r.userEmail ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [reviews, verdictFilter, urgencyFilter, search])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:              reviews.length,
    approved:           reviews.filter(r => r.verdict === 'approved').length,
    needs_review:       reviews.filter(r => r.verdict === 'needs_review').length,
    suspicious:         reviews.filter(r => r.verdict === 'suspicious').length,
    urgent:             reviews.filter(r => r.verdict === 'urgent').length,
    cancel_recommended: reviews.filter(r => r.verdict === 'cancel_recommended').length,
  }), [reviews])

  const suspicious = stats.suspicious + stats.urgent + stats.cancel_recommended

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              ←
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-violet-600" />
              AI Proof Monitor
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 ml-6">
            {reviews.length > 0
              ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''} · ${suspicious} suspicious · ${stats.urgent} urgent`
              : 'AI-powered analysis of uploaded payment proofs'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunReview}
            disabled={running}
            title="Refresh reviews"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={running ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleRunReview}
            disabled={running}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm disabled:opacity-60 transition-colors"
          >
            {running
              ? <RefreshCw size={14} className="animate-spin" />
              : <Play      size={14} />
            }
            {running ? `Analysing ${progress.done}/${progress.total}…` : 'Run AI Review'}
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {running && (
        <div className="w-full rounded-full bg-slate-200 h-1.5 overflow-hidden">
          <div
            className="h-full bg-violet-500 transition-all duration-300"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCard icon={<ShieldAlert size={18} />}  label="Total Reviews"       value={stats.total}              />
        <StatCard icon={<ShieldCheck size={18} />}  label="Approved"            value={stats.approved}            color="text-emerald-600" />
        <StatCard icon={<Eye         size={18} />}  label="Needs Review"        value={stats.needs_review}        color="text-amber-600"   />
        <StatCard icon={<AlertTriangle size={18}/>} label="Suspicious"          value={stats.suspicious}          color="text-orange-600"  />
        <StatCard icon={<Clock       size={18} />}  label="Urgent"              value={stats.urgent}              color="text-red-600"     />
        <StatCard icon={<Ban         size={18} />}  label="Cancel Recommended"  value={stats.cancel_recommended}  color="text-rose-700"    />
      </div>

      {/* ── Filters ── */}
      {reviews.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by transaction ID, reason..."
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-64 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Verdict filter */}
          <div className="relative">
            <select
              value={verdictFilter}
              onChange={e => setVerdictFilter(e.target.value as Verdict | 'all')}
              className="appearance-none pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
            >
              <option value="all">All Verdicts</option>
              {Object.entries(VERDICT_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Urgency filter */}
          <div className="relative">
            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value as Urgency | 'all')}
              className="appearance-none pl-3 pr-7 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
            >
              <option value="all">All Urgency</option>
              {Object.entries(URGENCY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* ── Setup hint ── */}
      {reviews.length === 0 && !loading && !running && (
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-700">
          <strong>Setup:</strong> Add <code className="bg-violet-100 px-1 rounded">geminiKey</code> to Firestore <code className="bg-violet-100 px-1 rounded">appSettings/main</code>, then click <strong>Run AI Review</strong> to analyse all uploaded payment proofs.
        </div>
      )}

      {/* ── Review list ── */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">
            {reviews.length === 0 ? 'No reviews yet — click Run AI Review to start.' : 'No reviews match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AIProofMonitor
