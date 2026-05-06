import { useState, useEffect } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { RefreshCw, Star, MessageSquare, TrendingUp, Users, Zap } from 'lucide-react'

interface FeedbackEntry {
  id: string
  rating?: number
  comment?: string
  topics?: string[]
  source?: 'page' | 'post-transfer'
  userName?: string
  userEmail?: string
  createdAt?: Timestamp
}

const TOPIC_COLORS: Record<string, string> = {
  'Transfer Speed':     'bg-blue-50 text-blue-700 border-blue-100',
  'App Experience':     'bg-violet-50 text-violet-700 border-violet-100',
  'Fees & Rates':       'bg-amber-50 text-amber-700 border-amber-100',
  'Customer Support':   'bg-green-50 text-green-700 border-green-100',
  'Trust & Safety':     'bg-teal-50 text-teal-700 border-teal-100',
  'Something Else':     'bg-gray-50 text-gray-600 border-gray-200',
}

function ratingColor(r: number) {
  if (r >= 8) return 'text-emerald-600 bg-emerald-50'
  if (r >= 5) return 'text-amber-600 bg-amber-50'
  return 'text-red-500 bg-red-50'
}

function formatDate(ts?: Timestamp) {
  if (!ts) return '—'
  const d = ts.toDate()
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(ts?: Timestamp) {
  if (!ts) return ''
  const diff = Date.now() - ts.toDate().getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

export default function UserFeedback() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'page' | 'post-transfer' | 'rated'>('all')
  const [topicFilter, setTopicFilter] = useState<string>('all')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedbackEntry)))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [refreshKey])

  // ── Stats ──────────────────────────────────────────────
  const total = entries.length
  const rated = entries.filter(e => e.rating != null && e.rating > 0)
  const avgRating = rated.length
    ? (rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length).toFixed(1)
    : '—'
  const fromPage = entries.filter(e => e.source === 'page' || !e.source).length
  const fromPost  = entries.filter(e => e.source === 'post-transfer').length
  const oneWeekAgo = Date.now() - 7 * 86400000
  const thisWeek = entries.filter(e => e.createdAt && e.createdAt.toDate().getTime() > oneWeekAgo).length

  const lowCount  = rated.filter(e => (e.rating ?? 0) <= 4).length
  const midCount  = rated.filter(e => (e.rating ?? 0) >= 5 && (e.rating ?? 0) <= 7).length
  const highCount = rated.filter(e => (e.rating ?? 0) >= 8).length

  // All unique topics
  const allTopics = Array.from(new Set(entries.flatMap(e => e.topics ?? []))).sort()

  // ── Filtered entries ───────────────────────────────────
  const filtered = entries.filter(e => {
    const srcMatch =
      filter === 'all' ? true :
      filter === 'rated' ? (e.rating != null && e.rating > 0) :
      filter === 'post-transfer' ? e.source === 'post-transfer' :
      (e.source === 'page' || !e.source)
    const topicMatch = topicFilter === 'all' ? true : (e.topics ?? []).includes(topicFilter)
    return srcMatch && topicMatch
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={20} className="text-sky-500" />
            User Feedback
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} total responses &middot; {thisWeek} this week
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Star size={11} />Avg Rating</span>
          <div className="text-3xl font-black text-gray-900">{avgRating}</div>
          <div className="text-xs text-gray-400">/10</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Users size={11} />Total</span>
          <div className="text-3xl font-black text-gray-900">{total}</div>
          <div className="text-xs text-gray-400">&nbsp;</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={11} />From Page</span>
          <div className="text-3xl font-black text-gray-900">{fromPage}</div>
          <div className="text-xs text-gray-400">page feedback</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Zap size={11} />Post-Transfer</span>
          <div className="text-3xl font-black text-gray-900">{fromPost}</div>
          <div className="text-xs text-gray-400">after transfer</div>
        </div>
      </div>

      {/* ── Rating distribution ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-wrap gap-6 items-center">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Rating breakdown</span>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            <span className="text-sm text-gray-600">Low <strong className="text-gray-900">{lowCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="text-sm text-gray-600">Mid <strong className="text-gray-900">{midCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-sm text-gray-600">High <strong className="text-gray-900">{highCount}</strong></span>
          </div>
        </div>
        {/* Bar */}
        {rated.length > 0 && (
          <div className="flex-1 min-w-[140px] h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="bg-red-400 h-full"     style={{ width: `${(lowCount  / rated.length) * 100}%` }} />
            <div className="bg-amber-400 h-full"   style={{ width: `${(midCount  / rated.length) * 100}%` }} />
            <div className="bg-emerald-400 h-full" style={{ width: `${(highCount / rated.length) * 100}%` }} />
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'page', 'post-transfer', 'rated'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === f ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : f === 'page' ? 'Page' : f === 'post-transfer' ? 'Post-Transfer' : 'Rated only'}
          </button>
        ))}
        {allTopics.length > 0 && (
          <>
            <span className="text-gray-300 text-xs">|</span>
            <select
              value={topicFilter}
              onChange={e => setTopicFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <option value="all">All Topics</option>
              {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} shown</span>
      </div>

      {/* ── Entries list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" /> Loading feedback…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No feedback found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <div key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-4 items-start">
              {/* Rating badge */}
              <div className="shrink-0 w-12 text-center">
                {e.rating != null && e.rating > 0 ? (
                  <>
                    <div className={`text-lg font-black rounded-xl px-2 py-1 ${ratingColor(e.rating)}`}>
                      {e.rating}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">/10</div>
                  </>
                ) : (
                  <div className="text-lg text-gray-300 font-bold mt-1">—</div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Topics */}
                {(e.topics ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(e.topics ?? []).map(topic => (
                      <span
                        key={topic}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TOPIC_COLORS[topic] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}
                      >
                        {topic}
                      </span>
                    ))}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      e.source === 'post-transfer'
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-sky-50 text-sky-600'
                    }`}>
                      {e.source === 'post-transfer' ? 'Post-Transfer' : 'Page'}
                    </span>
                  </div>
                )}

                {/* Comment */}
                {e.comment && (
                  <p className="text-sm text-gray-700 leading-relaxed mb-2">{e.comment}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-gray-400 flex-wrap gap-1">
                  <span className="font-medium text-gray-600">{e.userName || e.userEmail || 'Anonymous'}</span>
                  <span title={formatDate(e.createdAt)}>{formatDate(e.createdAt)} &middot; {timeAgo(e.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
