import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where, addDoc, Timestamp, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../services/firebase'
import { Agent, AgentPermission, PermissionRequest } from '../types/Agent'

type AgentAuthState = 'loading' | 'agent' | 'unauthenticated' | 'not-agent'

export function useAgentAuth() {
  const [authState, setAuthState] = useState<AgentAuthState>('loading')
  const [agentData, setAgentData] = useState<Agent | null>(null)
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !user.email) {
        setAuthState('unauthenticated')
        return
      }

      try {
        const snap = await getDocs(
          query(collection(db, 'agents'), where('email', '==', user.email.toLowerCase()))
        )
        if (snap.empty) {
          setAuthState('not-agent')
          return
        }
        const agentDoc = snap.docs[0]
        const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent
        setAgentData(agent)
        setAuthState('agent')

        // Listen for live updates to this agent's permission requests
        const reqUnsub = onSnapshot(
          query(collection(db, 'permissionRequests'), where('agentId', '==', agent.id)),
          (reqSnap) => {
            const reqs = reqSnap.docs.map(d => ({ id: d.id, ...d.data() })) as PermissionRequest[]
            setPermissionRequests(reqs)
          }
        )
        return () => reqUnsub()
      } catch {
        setAuthState('not-agent')
      }
    })
    return unsub
  }, [])

  // Refresh agent data from Firestore
  const refreshAgent = async () => {
    if (!agentData?.id) return
    try {
      const snap = await getDocs(query(collection(db, 'agents'), where('email', '==', agentData.email.toLowerCase())))
      if (!snap.empty) {
        const updated = { id: snap.docs[0].id, ...snap.docs[0].data() } as Agent
        setAgentData(updated)
      }
    } catch { /* ignore */ }
  }

  const requestPermission = async (permission: AgentPermission) => {
    if (!agentData) return
    // Check if there's already a pending request for this permission
    const existing = permissionRequests.find(
      r => r.permission === permission && r.status === 'pending'
    )
    if (existing) return

    await addDoc(collection(db, 'permissionRequests'), {
      agentId: agentData.id,
      agentName: agentData.name,
      agentEmail: agentData.email,
      permission,
      status: 'pending',
      requestedAt: Timestamp.now(),
    })
  }

  const getPermissionRequestStatus = (permission: AgentPermission): 'none' | 'pending' | 'approved' | 'denied' => {
    const req = permissionRequests
      .filter(r => r.permission === permission)
      .sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0))[0]
    return req ? req.status : 'none'
  }

  return { authState, agentData, permissionRequests, requestPermission, getPermissionRequestStatus, refreshAgent }
}
