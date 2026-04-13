import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, doc, updateDoc, addDoc, getDocs, where, Timestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Agent, AgentPermission, AgentStatus, PermissionRequest } from '../types/Agent'

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let agentsDone = false
    let requestsDone = false
    const checkDone = () => { if (agentsDone && requestsDone) setLoading(false) }

    const agentsUnsub = onSnapshot(query(collection(db, 'agents')), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Agent[]
      data.sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setAgents(data)
      agentsDone = true
      checkDone()
    }, err => {
      console.error('[Agents] error:', err)
      agentsDone = true
      checkDone()
    })

    const requestsUnsub = onSnapshot(query(collection(db, 'permissionRequests')), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PermissionRequest[]
      data.sort((a: any, b: any) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0))
      setPermissionRequests(data)
      requestsDone = true
      checkDone()
    }, err => {
      console.error('[PermissionRequests] error:', err)
      requestsDone = true
      checkDone()
    })

    return () => { agentsUnsub(); requestsUnsub() }
  }, [])

  const addAgent = async (name: string, email: string) => {
    await addDoc(collection(db, 'agents'), {
      name,
      email,
      status: 'active',
      permissions: ['transactions'], // default access
      createdAt: Timestamp.now(),
    })
    // Sync role in the users collection so UserManagement reflects it
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
      snap.forEach(d => updateDoc(d.ref, { role: 'agent' }))
    } catch { /* not critical */ }
  }

  const updatePermissions = async (agentId: string, permissions: AgentPermission[]) => {
    await updateDoc(doc(db, 'agents', agentId), { permissions, updatedAt: Timestamp.now() })
  }

  const updateStatus = async (agentId: string, status: AgentStatus) => {
    await updateDoc(doc(db, 'agents', agentId), { status, updatedAt: Timestamp.now() })
    // Sync suspended/active back to users collection
    try {
      const agentSnap = await getDocs(query(collection(db, 'agents')))
      const agent = agentSnap.docs.find(d => d.id === agentId)?.data()
      if (agent?.email) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', agent.email)))
        userSnap.forEach(d => updateDoc(d.ref, { status }))
      }
    } catch { /* not critical */ }
  }

  const resolveRequest = async (
    requestId: string,
    resolution: 'approved' | 'denied',
    agentId?: string,
    permission?: AgentPermission,
    currentPermissions?: AgentPermission[],
  ) => {
    await updateDoc(doc(db, 'permissionRequests', requestId), {
      status: resolution,
      resolvedAt: Timestamp.now(),
    })
    if (resolution === 'approved' && agentId && permission && currentPermissions) {
      const newPerms = [...new Set([...currentPermissions, permission])]
      await updateDoc(doc(db, 'agents', agentId), { permissions: newPerms, updatedAt: Timestamp.now() })
    }
  }

  return { agents, permissionRequests, loading, addAgent, updatePermissions, updateStatus, resolveRequest }
}
