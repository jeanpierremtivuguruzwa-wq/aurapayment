import React from 'react'
import { signOut, updateProfile } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '../../services/firebase'
import { Agent, AgentPermission } from '../../types/Agent'

const PERMISSION_META: Record<AgentPermission, { icon: string; label: string; desc: string }> = {
  transactions:          { icon: '📊', label: 'All Transactions',      desc: 'View and manage all payment transactions' },
  orders:                { icon: '📦', label: 'Orders',                desc: 'View, complete and cancel customer orders' },
  users:                 { icon: '👤', label: 'User Management',       desc: 'View registered users and their details' },
  currency:              { icon: '💱', label: 'Currency Pairs',        desc: 'View and edit currency exchange rates' },
  payments:              { icon: '💳', label: 'Payment Methods',       desc: 'View and manage payment methods' },
  cardholders:           { icon: '👥', label: 'Cardholders',           desc: 'View and manage cardholder records' },
  'cardholder-activity': { icon: '📈', label: 'Cardholder Activity',   desc: 'View cardholder transaction activity history' },
  chat:                  { icon: '💬', label: 'AuraChat',              desc: 'Access the internal Aura chat system' },
  wallet:                { icon: '💰', label: 'AuraWallet',            desc: 'View and manage Aura wallet records' },
  'currency-assignments':{ icon: '🏦', label: 'Currency Assignments',  desc: 'Manage cardholder currency assignments' },
  notifications:         { icon: '🔔', label: 'Notifications',         desc: 'Manage notification recipients and alerts' },
  support:               { icon: '🎧', label: 'User Support',           desc: 'Answer user support tickets and chat' },
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_META) as AgentPermission[]

interface Props {
  agent: Agent
}

const AgentProfile: React.FC<Props> = ({ agent }) => {
  const user = auth.currentUser

  const [editing, setEditing] = React.useState(false)
  const [newName, setNewName] = React.useState(user?.displayName || agent.name)
  const [saving, setSaving] = React.useState(false)
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null)
  const [photoURL, setPhotoURL] = React.useState<string | null>(
    user?.photoURL || agent.photoURL || null
  )
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleSaveName = async () => {
    if (!user || !newName.trim()) return
    setSaving(true)
    try {
      await updateProfile(user, { displayName: newName.trim() })
      setSaveMsg('Name updated!')
      setEditing(false)
    } catch (e) {
      setSaveMsg('Error: ' + (e as Error).message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { setSaveMsg('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setSaveMsg('Image must be under 5 MB.'); return }
    setUploadingPhoto(true)
    try {
      const storageRef = ref(storage, `agent-avatars/${user.uid}/profile.jpg`)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateProfile(user, { photoURL: url })
      setPhotoURL(url)
      setSaveMsg('Photo updated!')
    } catch (e) {
      setSaveMsg('Upload failed: ' + (e as Error).message)
    } finally {
      setUploadingPhoto(false)
      setTimeout(() => setSaveMsg(null), 3000)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    window.location.href = '../signin.html'
  }

  const getInitials = (name: string) =>
    (name || 'A').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)

  const displayName = user?.displayName || agent.name || agent.email.split('@')[0]
  const email = agent.email

  const grantedPerms = ALL_PERMISSIONS.filter(p => agent.permissions.includes(p))
  const lockedPerms  = ALL_PERMISSIONS.filter(p => !agent.permissions.includes(p))

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Profile Card ── */}
      <div className="card-base p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden cursor-pointer group shadow-lg border-2 border-slate-200"
              onClick={() => fileInputRef.current?.click()}
              title="Click to upload photo"
            >
              {photoURL ? (
                <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                  {getInitials(displayName)}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-semibold">{uploadingPhoto ? 'Uploading…' : '📷 Change'}</span>
              </div>
            </div>
            <span className="absolute -bottom-2 -right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow">
              Agent
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 w-full max-w-xs"
                  placeholder="Display name"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setNewName(user?.displayName || agent.name) }}
                  className="text-slate-500 hover:text-slate-700 text-sm px-3 py-1.5 rounded-lg border border-slate-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
                <button
                  onClick={() => setEditing(true)}
                  className="text-slate-400 hover:text-amber-600 text-xs border border-slate-200 px-2 py-0.5 rounded-lg transition-colors"
                >
                  ✏ Edit
                </button>
              </div>
            )}
            {saveMsg && <p className="text-sm text-green-600 font-medium mb-1">{saveMsg}</p>}
            <p className="text-slate-500 text-sm mb-3">{email}</p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold px-3 py-1 rounded-full">
                🕵️ Agent
              </span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                agent.status === 'active'
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-red-100 text-red-800 border-red-200'
              }`}>
                {agent.status === 'active' ? '● Active' : '● Suspended'}
              </span>
              {user?.emailVerified && (
                <span className="inline-flex items-center gap-1.5 bg-sky-100 text-sky-800 border border-sky-200 text-xs font-semibold px-3 py-1 rounded-full">
                  ✓ Verified
                </span>
              )}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="shrink-0 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Permissions ── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-base font-semibold text-slate-800">My Permissions</h3>
          <span className="bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {grantedPerms.length} / {ALL_PERMISSIONS.length} Granted
          </span>
        </div>

        {grantedPerms.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {grantedPerms.map(p => {
              const meta = PERMISSION_META[p]
              return (
                <div key={p} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800">{meta.label}</span>
                      <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {lockedPerms.length > 0 && (
          <>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Not yet granted</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lockedPerms.map(p => {
                const meta = PERMISSION_META[p]
                return (
                  <div key={p} className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 opacity-60">
                    <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-600">{meta.label}</span>
                        <span className="text-slate-400 text-xs">🔒</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{meta.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Account Details ── */}
      <div className="card-base p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Account Details</h3>
        <div className="divide-y divide-slate-100">
          {[
            { label: 'Display Name', value: displayName },
            { label: 'Email Address', value: email },
            { label: 'Role',          value: 'Agent' },
            { label: 'Status',        value: agent.status === 'active' ? 'Active ●' : 'Suspended ●' },
            { label: 'Agent ID',      value: agent.id, mono: true },
            { label: 'Email Verified', value: user?.emailVerified ? 'Yes ✓' : 'No' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500">{row.label}</span>
              <span className={`text-sm font-medium text-slate-900 ${(row as any).mono ? 'font-mono text-xs bg-slate-100 px-2 py-0.5 rounded' : ''}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

export default AgentProfile
