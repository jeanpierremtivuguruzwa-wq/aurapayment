import React, { useEffect, useRef, useState } from 'react'
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, Timestamp, doc, updateDoc, getDocs, setDoc,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, auth, storage } from '../../services/firebase'
import { Agent } from '../../types/Agent'
import { MessageCircle, Pin, Camera } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  roomId: string
  text: string
  imageUrl?: string
  senderUid: string
  senderName: string
  senderRole: 'admin' | 'agent'
  createdAt: Timestamp | null
  pinnedRef?: string
  pinnedLabel?: string
  type: 'text' | 'system' | 'image'
  read: boolean
}

interface ChatRoom {
  id: string
  agentId: string
  agentName: string
  agentEmail: string
  lastMessage?: string
  lastAt?: Timestamp | null
  unreadAdmin?: number
}

interface Props {
  /** Pass the Agent object when rendered inside AgentDashboard; omit for admin */
  viewerAgent?: Agent
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDay(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  const today = new Date()
  const diff = (today.getTime() - d.getTime()) / 86400000
  if (diff < 1) return 'Today'
  if (diff < 2) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Main Component ────────────────────────────────────────────────────────────
const AuraChat: React.FC<Props> = ({ viewerAgent }) => {
  const isAgentViewer = !!viewerAgent   // true = agent is using this chat
  const viewerRole: 'admin' | 'agent' = isAgentViewer ? 'agent' : 'admin'
  const viewerName = isAgentViewer ? (viewerAgent!.name || 'Agent') : 'Admin'
  const [agents, setAgents] = useState<Agent[]>([])
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [pinnedRef, setPinnedRef] = useState('')
  const [pinnedLabel, setPinnedLabel] = useState('')
  const [showPinForm, setShowPinForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [lightboxUrl, setLightboxUrl] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const msgUnsubRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const adminUser = auth.currentUser

  // ── Load agents → derive rooms ────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'agents'))
    const unsub = onSnapshot(q, snap => {
      const agentList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Agent))
      setAgents(agentList)

      // Build or merge with chat rooms
      const roomQ = query(collection(db, 'chatRooms'))
      getDocs(roomQ).then(roomSnap => {
        const existing: Record<string, ChatRoom> = {}
        roomSnap.docs.forEach(d => { existing[d.id] = { id: d.id, ...d.data() } as ChatRoom })

        const merged: ChatRoom[] = agentList.map(agent => {
          const roomId = `admin_${agent.id}`
          return existing[roomId] ?? {
            id: roomId,
            agentId: agent.id,
            agentName: agent.name,
            agentEmail: agent.email,
            unreadAdmin: 0,
          }
        })
        setRooms(merged)

        // If agent is viewing — auto-select their own room
        if (isAgentViewer && viewerAgent) {
          const myRoom = merged.find(r => r.agentId === viewerAgent.id)
          if (myRoom) setSelectedRoom(myRoom)
        }
      })
    })
    return unsub
  }, [])

  // ── Subscribe to messages for selected room ───────────────────────────────
  useEffect(() => {
    if (msgUnsubRef.current) { msgUnsubRef.current(); msgUnsubRef.current = null }
    if (!selectedRoom) return

    setLoadingMsgs(true)
    setMessages([])

    const q = query(
      collection(db, 'chatRooms', selectedRoom.id, 'messages'),
      orderBy('createdAt', 'asc'),
    )
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage))
      setMessages(msgs)
      setLoadingMsgs(false)
      // mark as read (admin side)
      const unreadIds = snap.docs
        .filter(d => d.data().senderRole === 'agent' && !d.data().read)
        .map(d => d.ref)
      unreadIds.forEach(ref => updateDoc(ref, { read: true }))
    })
    msgUnsubRef.current = unsub
    return unsub
  }, [selectedRoom?.id])

  // ── Auto scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!selectedRoom || !text.trim() || sending) return
    setSending(true)
    try {
      const roomRef = doc(db, 'chatRooms', selectedRoom.id)
      const msgData: Omit<ChatMessage, 'id'> = {
        roomId: selectedRoom.id,
        text: text.trim(),
        senderUid: adminUser?.uid ?? viewerRole,
        senderName: viewerName,
        senderRole: viewerRole,
        createdAt: serverTimestamp() as unknown as Timestamp,
        type: 'text',
        read: false,
        ...(pinnedRef.trim() ? { pinnedRef: pinnedRef.trim(), pinnedLabel: pinnedLabel.trim() || pinnedRef.trim() } : {}),
      }
      await addDoc(collection(db, 'chatRooms', selectedRoom.id, 'messages'), msgData)
      // Update room preview
      await updateDoc(roomRef, {
        lastMessage: text.trim(),
        lastAt: serverTimestamp(),
        agentId: selectedRoom.agentId,
        agentName: selectedRoom.agentName,
        agentEmail: selectedRoom.agentEmail,
      }).catch(() => {
        // If doc doesn't exist yet, create it
        setDoc(roomRef, {
          agentId: selectedRoom.agentId,
          agentName: selectedRoom.agentName,
          agentEmail: selectedRoom.agentEmail,
          lastMessage: text.trim(),
          lastAt: serverTimestamp(),
          unreadAdmin: 0,
        })
      })
      setText('')
      setPinnedRef('')
      setPinnedLabel('')
      setShowPinForm(false)
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Pick image ────────────────────────────────────────────────────────────
  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Image must be under 10 MB'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    // reset so same file can be picked again
    e.target.value = ''
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview('')
    setUploadProgress(0)
  }

  // ── Send image ────────────────────────────────────────────────────────────
  async function sendImage() {
    if (!selectedRoom || !imageFile || uploading) return
    setUploading(true)
    setUploadProgress(0)
    try {
      const ext = imageFile.name.split('.').pop() || 'jpg'
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const sRef = storageRef(storage, `chatImages/${selectedRoom.id}/${fileName}`)
      const task = uploadBytesResumable(sRef, imageFile)
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve,
        )
      })
      const url = await getDownloadURL(task.snapshot.ref)
      const roomRef = doc(db, 'chatRooms', selectedRoom.id)
      await addDoc(collection(db, 'chatRooms', selectedRoom.id, 'messages'), {
        roomId: selectedRoom.id,
        text: '',
        imageUrl: url,
        senderUid: adminUser?.uid ?? viewerRole,
        senderName: viewerName,
        senderRole: viewerRole,
        createdAt: serverTimestamp(),
        type: 'image',
        read: false,
      })
      await updateDoc(roomRef, {
        lastMessage: 'Photo',
        lastAt: serverTimestamp(),
        agentId: selectedRoom.agentId,
        agentName: selectedRoom.agentName,
        agentEmail: selectedRoom.agentEmail,
      }).catch(() => setDoc(roomRef, {
        agentId: selectedRoom.agentId,
        agentName: selectedRoom.agentName,
        agentEmail: selectedRoom.agentEmail,
        lastMessage: 'Photo',
        lastAt: serverTimestamp(),
        unreadAdmin: 0,
      }))
      clearImage()
    } catch (err) {
      console.error('Image upload failed', err)
      alert('Failed to send image. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // ── Group messages by day ─────────────────────────────────────────────────
  const grouped: { day: string; msgs: ChatMessage[] }[] = []
  messages.forEach(m => {
    const day = formatDay(m.createdAt)
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, msgs: [m] })
    } else {
      grouped[grouped.length - 1].msgs.push(m)
    }
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Sidebar: agent list (admin only) ── */}
      {!isAgentViewer && <div className="w-72 border-r border-slate-100 flex flex-col bg-slate-50">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><MessageCircle className="w-5 h-5" /> AuraChat</h2>
          <p className="text-xs text-slate-400 mt-0.5">Direct messages with agents</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {rooms.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8 px-4">No agents yet.<br/>Add agents in Agent Management.</p>
          )}
          {rooms.map(room => {
            const isSelected = selectedRoom?.id === room.id
            const agentObj = agents.find(a => a.id === room.agentId)
            const initials = (room.agentName || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
            const isOnline = agentObj?.status === 'active'
            return (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-100 transition-all ${isSelected ? 'bg-sky-50 border-r-2 border-sky-500' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  {agentObj?.photoURL ? (
                    <img src={agentObj.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                      {initials}
                    </div>
                  )}
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? 'bg-green-400' : 'bg-slate-300'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800 truncate">{room.agentName}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{room.lastMessage || 'No messages yet'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>}

      {/* ── Main chat area ── */}
      {!selectedRoom ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-base font-medium">Select an agent to start chatting</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">

          {/* Chat header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-white">
            {(() => {
              const headerAgent = agents.find(a => a.id === selectedRoom.agentId)
              const headerInitials = (selectedRoom.agentName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
              return headerAgent?.photoURL ? (
                <img src={headerAgent.photoURL} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {headerInitials}
                </div>
              )
            })()}
            <div>
              <p className="font-semibold text-slate-800 text-sm">{selectedRoom.agentName}</p>
              <p className="text-xs text-slate-400">{selectedRoom.agentEmail}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50">
            {loadingMsgs && (
              <div className="text-center text-sm text-slate-400 py-10">Loading messages…</div>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-10">
                No messages yet. Say hello to {selectedRoom.agentName}!
              </div>
            )}
            {grouped.map(({ day, msgs }) => (
              <div key={day}>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">{day}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="space-y-3">
                  {msgs.map(msg => {
                    const isAdmin = msg.senderRole === 'admin'
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[70%] flex flex-col gap-1 ${isAdmin ? 'items-start' : 'items-end'}`}>
                          <span className="text-xs font-semibold px-1" style={{ color: isAdmin ? '#1d4ed8' : '#15803d' }}>
                            {isAdmin ? (msg.senderName || 'Admin') : msg.senderName}
                          </span>
                          {msg.pinnedRef && (
                            <div
                              className="text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5"
                              style={isAdmin
                                ? { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }
                                : { background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }
                              }
                            >
                              <Pin className="w-3 h-3 inline-block" /> {msg.pinnedLabel || msg.pinnedRef}
                            </div>
                          )}
                          {msg.type === 'image' && msg.imageUrl ? (
                            <img
                              src={msg.imageUrl}
                              alt="photo"
                              onClick={() => setLightboxUrl(msg.imageUrl!)}
                              className={`max-w-[260px] max-h-[280px] rounded-2xl object-cover cursor-zoom-in hover:opacity-90 transition-opacity border-2 ${isAdmin ? 'border-blue-300' : 'border-green-300'}`}
                            />
                          ) : (
                            <div
                              className={`px-4 py-2.5 text-sm leading-relaxed break-words text-white ${isAdmin ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl rounded-tr-sm'}`}
                              style={{ background: isAdmin ? '#2563eb' : '#16a34a' }}
                            >
                              {msg.text}
                            </div>
                          )}
                          <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Pin form */}
          {showPinForm && (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 flex gap-2 items-center">
              <span className="text-sm text-amber-700 font-medium flex-shrink-0"><Pin className="w-3.5 h-3.5 inline-block" /> Pin ref:</span>
              <input
                className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                placeholder="Order ID or Transaction ID"
                value={pinnedRef}
                onChange={e => setPinnedRef(e.target.value)}
              />
              <input
                className="w-40 border border-amber-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                placeholder="Label (optional)"
                value={pinnedLabel}
                onChange={e => setPinnedLabel(e.target.value)}
              />
              <button onClick={() => { setShowPinForm(false); setPinnedRef(''); setPinnedLabel('') }}
                className="text-amber-500 hover:text-amber-700 text-lg">✕</button>
            </div>
          )}

          {/* Image preview strip */}
          {imagePreview && (
            <div className="px-6 py-3 bg-sky-50 border-t border-sky-200 flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-sky-200" />
                <button
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                >✕</button>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-sky-700 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Photo ready to send</p>
                <p className="text-xs text-sky-500 truncate">{imageFile?.name}</p>
                {uploading && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-sky-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-sky-500 mt-0.5">{uploadProgress}% uploaded…</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />

          {/* Input area */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex gap-3 items-end">
            <button
              onClick={() => setShowPinForm(p => !p)}
              title="Pin a transaction or order reference"
              className={`p-2.5 rounded-xl text-base transition-all flex-shrink-0 ${showPinForm ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            ><Pin className="w-4 h-4" /></button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Send a photo"
              disabled={uploading}
              className={`p-2.5 rounded-xl text-base transition-all flex-shrink-0 ${imageFile ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} disabled:opacity-50`}
            ><Camera className="w-4 h-4" /></button>
            <textarea
              rows={1}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 bg-slate-50 disabled:opacity-50"
              placeholder={imageFile ? 'Press Send Photo to share the image…' : `Message ${selectedRoom.agentName}…`}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!!imageFile}
            />
            {imageFile ? (
              <button
                onClick={sendImage}
                disabled={uploading}
                className="px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 disabled:opacity-50 transition-all flex-shrink-0 flex items-center gap-1.5"
              >
                {uploading
                  ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  : <Camera className="w-4 h-4" />}
                Send Photo
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!text.trim() || sending}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all flex-shrink-0 flex items-center gap-1.5"
              >
                {sending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : '↗'}
                Send
              </button>
            )}
          </div>

        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl('')}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="full size"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxUrl('')}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white text-gray-800 rounded-full text-base font-bold flex items-center justify-center shadow-lg hover:bg-gray-100"
            >✕</button>
            <a
              href={lightboxUrl}
              download
              onClick={e => e.stopPropagation()}
              className="absolute bottom-3 right-3 px-3 py-1.5 bg-white/90 text-gray-700 rounded-xl text-xs font-semibold hover:bg-white shadow flex items-center gap-1"
            >⬇ Download</a>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuraChat
