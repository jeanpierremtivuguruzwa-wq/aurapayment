import React, { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  orderBy, query, setDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Clock, Ban,
  Play, RefreshCw, ChevronDown, ChevronUp, Filter,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Verdict  = 'approved' | 'needs_review' | 'suspicious' | 'urgent' | 'cancel_recommended'
type Urgency  = 'low' | 'medium' | 'high' | 'critical'

interface FraudReview {
  id: string          // userId
  userEmail: string
  userName: string
  verdict: Verdict
  urgency: Urgency
  confidence: number  // 0–100
  explanation: string
  signalFlags: string[]
  reviewedAt: Timestamp | null
  orderCount: number
  totalVolume: number
}

interface UserRecord {
  id: string
  email: string
  fullName?: string
  displayName?: string
  phone?: string
  status?: string
  role?: string
  createdAt?: { seconds: number } | null
}

interface OrderRecord {
  id: string
  userId?: string
  sendAmount?: number
  sendCurrency?: string
  receiveCurrency?: string
  status?: string
  createdAt?: { seconds: number } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VERDICT_META: Record<Verdict, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  approved:            { label: 'Approved',            color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: ShieldCheck   },
  needs_review:        { label: 'Needs Review',        color: 'text-amber-700',   bg: 'bg-amber-100',   Icon: Clock          },
  suspicious:          { label: 'Suspicious',          color: 'text-orange-700',  bg: 'bg-orange-100',  Icon: AlertTriangle  },
  urgent:              { label: 'Urgent',              color: 'text-red-700',     bg: 'bg-red-100',     Icon: ShieldAlert    },
  cancel_recommended:  { label: 'Cancel Recommended',  color: 'text-rose-800',    bg: 'bg-rose-100',    Icon: Ban            },
}

const URGENCY_META: Record<Urgency, { label: string; dot: string }> = {
  low:      { label: 'Low',      dot: 'bg-emerald-400' },
  medium:   { label: 'Medium',   dot: 'bg-amber-400'   },
  high:     { label: 'High',     dot: 'bg-orange-500'  },
  critical: { label: 'Critical', dot: 'bg-red-600'     },
}

function truncate(str: string, n = 14) {
  return str.length > n ? str.slice(0, n) + '…' : str
}

function fmtDate(ts: Timestamp | null): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtSec(sec?: number): string {
  if (!sec) return '—'
  return new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${res.status}: ${err}`)
  }
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function buildPrompt(user: UserRecord, orders: OrderRecord[], allUsers: UserRecord[]): string {
  const dupPhone = user.phone
    ? allUsers.filter(u => u.id !== user.id && u.phone === user.phone).length
    : 0
  const dupEmail = allUsers.filter(
    u => u.id !== user.id && u.email && user.email &&
         u.email.split('@')[0].toLowerCase() === user.email.split('@')[0].toLowerCase() &&
         u.email !== user.email
  ).length

  const orderSummary = orders.slice(0, 20).map(o =>
    `  - ${o.status ?? 'unknown'} | ${o.sendAmount ?? '?'} ${o.sendCurrency ?? '?'} → ${o.receiveCurrency ?? '?'} | ${fmtSec(o.createdAt?.seconds)}`
  ).join('\n')

  const accountAgeDays = user.createdAt?.seconds
    ? Math.floor((Date.now() / 1000 - user.createdAt.seconds) / 86400)
    : null

  const prompt = `You are a fraud detection AI for a payment platform. Analyze the following user account and return a JSON object ONLY (no markdown, no extra text).

USER DATA:
- ID: ${user.id}
- Name: ${user.fullName || user.displayName || 'N/A'}
- Email: ${user.email}
- Phone: ${user.phone || 'N/A'}
- Status: ${user.status || 'active'}
- Role: ${user.role || 'user'}
- Account age: ${accountAgeDays !== null ? `${accountAgeDays} days` : 'unknown'}
- Total orders: ${orders.length}
- Total send volume: ${orders.reduce((s, o) => s + (Number(o.sendAmount) || 0), 0).toFixed(2)}
- Orders with 'completed' status: ${orders.filter(o => o.status === 'completed').length}
- Orders with 'cancelled' status: ${orders.filter(o => o.status === 'cancelled').length}
- Duplicate phone across accounts: ${dupPhone}
- Similar email base across accounts: ${dupEmail}
- Recent orders (newest 20):
${orderSummary || '  (none)'}

FRAUD SIGNALS TO CHECK:
1. Duplicate phone number used by multiple accounts
2. Suspicious email patterns (temp domains, random strings, many numbers)
3. Very new account with high transaction volume
4. Many cancelled orders
5. Sudden volume spikes
6. Multiple failed/pending orders
7. Mismatched name patterns

Return ONLY this JSON (no code block, no explanation outside JSON):
{
  "verdict": "approved" | "needs_review" | "suspicious" | "urgent" | "cancel_recommended",
  "urgency": "low" | "medium" | "high" | "critical",
  "confidence": <integer 0-100>,
  "explanation": "<1-2 sentence explanation>",
  "signalFlags": ["<flag1>", "<flag2>"]
}`
  return prompt
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = 'text-slate-800' }) => (
  <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-col items-center gap-1">
    <span className={`text-3xl font-bold ${color}`}>{value}</span>
    <span className="text-xs text-slate-500 font-medium text-center leading-tight">{label}</span>
  </div>
)

// ── Review Row ────────────────────────────────────────────────────────────────

const ReviewRow: React.FC<{ review: FraudReview }> = ({ review }) => {
  const [open, setOpen] = useState(false)
  const vm = VERDICT_META[review.verdict]
  const um = URGENCY_META[review.urgency]
  const Icon = vm.Icon

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-start sm:items-center gap-3 hover:bg-slate-50 transition-colors"
      >
        {/* ID */}
        <div className="min-w-[120px]">
          <p className="text-sm font-mono font-semibold text-slate-700">{truncate(review.id, 12)}…</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{review.userEmail}</p>
        </div>

        {/* Verdict badge */}
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${vm.bg} ${vm.color} flex-shrink-0`}>
          <Icon size={12} strokeWidth={2} />
          {vm.label}
        </span>

        {/* Explanation */}
        <p className="flex-1 text-xs text-slate-600 leading-relaxed line-clamp-2 hidden sm:block">
          {review.explanation}
        </p>

        {/* Urgency + confidence */}
        <div className="flex-shrink-0 text-right hidden md:block">
          <div className="flex items-center gap-1.5 justify-end">
            <span className={`w-2 h-2 rounded-full ${um.dot}`} />
            <span className="text-xs text-slate-500 font-medium">{um.label}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{review.confidence}% confident</p>
        </div>

        {open ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3 bg-slate-50">
          {/* Explanation */}
          <p className="text-sm text-slate-700 leading-relaxed">{review.explanation}</p>

          {/* Signal flags */}
          {review.signalFlags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {review.signalFlags.map(f => (
                <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-slate-200 text-slate-600 font-medium">
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-500">
            <span>Orders: <strong className="text-slate-700">{review.orderCount}</strong></span>
            <span>Volume: <strong className="text-slate-700">{review.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
            <span>Reviewed: <strong className="text-slate-700">{fmtDate(review.reviewedAt)}</strong></span>
            <span>Name: <strong className="text-slate-700">{review.userName || '—'}</strong></span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${um.dot}`} />
              <span>{um.label} urgency · {review.confidence}% confident</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const AIFraudMonitor: React.FC = () => {
  const [reviews, setReviews]               = useState<FraudReview[]>([])
  const [running, setRunning]               = useState(false)
  const [progress, setProgress]             = useState({ done: 0, total: 0 })
  const [verdictFilter, setVerdictFilter]   = useState<Verdict | 'all'>('all')
  const [urgencyFilter, setUrgencyFilter]   = useState<Urgency | 'all'>('all')
  const [error, setError]                   = useState<string | null>(null)
  const [loadingReviews, setLoadingReviews] = useState(true)

  // ── Live reviews ───────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'fraudReviews'), orderBy('reviewedAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as FraudReview)))
      setLoadingReviews(false)
    }, () => setLoadingReviews(false))
    return unsub
  }, [])

  // ── Run AI Review ──────────────────────────────────────────────────────────
  const handleRunReview = async () => {
    setError(null)
    setRunning(true)
    try {
      // 1. Fetch Gemini API key from appSettings/main
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'main'))
      const geminiKey: string = settingsSnap.data()?.geminiKey ?? ''
      if (!geminiKey) {
        setError('Gemini API key not set. Add "geminiKey" to Firestore appSettings/main.')
        return
      }

      // 2. Fetch all users
      const usersSnap = await getDocs(collection(db, 'users'))
      const allUsers: UserRecord[] = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserRecord))

      // 3. Fetch all orders
      const ordersSnap = await getDocs(collection(db, 'orders'))
      const allOrders: OrderRecord[] = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrderRecord))

      // Index orders by userId
      const ordersByUser: Record<string, OrderRecord[]> = {}
      for (const o of allOrders) {
        if (o.userId) {
          if (!ordersByUser[o.userId]) ordersByUser[o.userId] = []
          ordersByUser[o.userId].push(o)
        }
      }

      setProgress({ done: 0, total: allUsers.length })

      // 4. Analyse each user (one at a time to avoid rate limits)
      for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i]
        const userOrders = ordersByUser[user.id] ?? []
        const totalVolume = userOrders.reduce((s, o) => s + (Number(o.sendAmount) || 0), 0)

        let verdict: Verdict      = 'needs_review'
        let urgency: Urgency      = 'medium'
        let confidence            = 0
        let explanation           = 'AI temporarily unavailable. Manual review required.'
        let signalFlags: string[] = []

        try {
          const prompt = buildPrompt(user, userOrders, allUsers)
          const raw = await callGemini(geminiKey, prompt)

          // Sanitise: strip any accidental markdown code fences
          const cleaned = raw.replace(/```json|```/g, '').trim()
          const parsed  = JSON.parse(cleaned)

          verdict     = parsed.verdict     ?? 'needs_review'
          urgency     = parsed.urgency     ?? 'medium'
          confidence  = Number(parsed.confidence) || 0
          explanation = parsed.explanation ?? explanation
          signalFlags = Array.isArray(parsed.signalFlags) ? parsed.signalFlags : []
        } catch (e) {
          explanation = `AI temporarily unavailable (${(e as Error).message}). Manual review required.`
        }

        const review: Omit<FraudReview, 'id'> = {
          userEmail: user.email ?? '',
          userName:  user.fullName || user.displayName || '',
          verdict,
          urgency,
          confidence,
          explanation,
          signalFlags,
          reviewedAt:  Timestamp.now(),
          orderCount:  userOrders.length,
          totalVolume,
        }

        await setDoc(doc(db, 'fraudReviews', user.id), review)
        setProgress({ done: i + 1, total: allUsers.length })

        // Small delay to respect Gemini rate limits
        if (i < allUsers.length - 1) await new Promise(r => setTimeout(r, 300))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...reviews]
    if (verdictFilter !== 'all') list = list.filter(r => r.verdict === verdictFilter)
    if (urgencyFilter !== 'all') list = list.filter(r => r.urgency === urgencyFilter)
    return list
  }, [reviews, verdictFilter, urgencyFilter])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:              reviews.length,
    approved:           reviews.filter(r => r.verdict === 'approved').length,
    needs_review:       reviews.filter(r => r.verdict === 'needs_review').length,
    suspicious:         reviews.filter(r => r.verdict === 'suspicious').length,
    urgent:             reviews.filter(r => r.verdict === 'urgent').length,
    cancel_recommended: reviews.filter(r => r.verdict === 'cancel_recommended').length,
  }), [reviews])

  const suspiciousOrWorse = stats.suspicious + stats.urgent + stats.cancel_recommended

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            AI Fraud Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {reviews.length > 0
              ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''} · ${suspiciousOrWorse} suspicious`
              : 'Detect fraud patterns in user accounts using Gemini AI'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleRunReview}
            disabled={running}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {running
              ? <RefreshCw size={15} className="animate-spin" />
              : <Play size={15} />}
            {running ? `Analysing ${progress.done}/${progress.total}…` : 'Run AI Review'}
          </button>
          {running && (
            <div className="w-full rounded-full bg-slate-200 h-1.5 mt-1 overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCard label="Total Reviews"       value={stats.total}              />
        <StatCard label="Approved"            value={stats.approved}            color="text-emerald-600" />
        <StatCard label="Needs Review"        value={stats.needs_review}        color="text-amber-600"   />
        <StatCard label="Suspicious"          value={stats.suspicious}          color="text-orange-600"  />
        <StatCard label="Urgent"              value={stats.urgent}              color="text-red-600"     />
        <StatCard label="Cancel Recommended"  value={stats.cancel_recommended}  color="text-rose-800"    />
      </div>

      {/* ── AI Key hint ── */}
      {reviews.length === 0 && !loadingReviews && !running && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <strong>Setup:</strong> Make sure <code className="bg-blue-100 px-1 rounded">appSettings/main.geminiKey</code> is set in Firestore, then click <strong>Run AI Review</strong>.
        </div>
      )}

      {/* ── Filters ── */}
      {reviews.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-slate-400" />

          {/* Verdict filter */}
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'approved', 'needs_review', 'suspicious', 'urgent', 'cancel_recommended'] as const).map(v => {
              const active = verdictFilter === v
              const meta = v !== 'all' ? VERDICT_META[v] : null
              return (
                <button
                  key={v}
                  onClick={() => setVerdictFilter(v)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                    active
                      ? meta ? `${meta.bg} ${meta.color}` : 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {v === 'all' ? 'All Verdicts' : VERDICT_META[v].label}
                </button>
              )
            })}
          </div>

          <div className="w-px h-5 bg-slate-200 mx-1" />

          {/* Urgency filter */}
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'low', 'medium', 'high', 'critical'] as const).map(u => {
              const active = urgencyFilter === u
              const meta = u !== 'all' ? URGENCY_META[u] : null
              return (
                <button
                  key={u}
                  onClick={() => setUrgencyFilter(u)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                    active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {meta && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
                  {u === 'all' ? 'All Urgency' : URGENCY_META[u].label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Review List ── */}
      {loadingReviews ? (
        <div className="text-center py-12 text-slate-400">Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">
            {reviews.length === 0 ? 'No reviews yet — click Run AI Review to start.' : 'No reviews match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AIFraudMonitor
