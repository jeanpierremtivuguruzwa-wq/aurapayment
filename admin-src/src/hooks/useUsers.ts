import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, doc, updateDoc, getDoc, addDoc, getDocs, where, Timestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import { AppUser, UserRole, UserStatus } from '../types/AppUser'

export function useUsers() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'users'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as AppUser[]

      // Newest first
      data.sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

      setUsers(data)
      setLoading(false)
    }, (err) => {
      console.error('[Users] error:', err)
      setError(err.message)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const updateStatus = async (userId: string, status: UserStatus) => {
    await updateDoc(doc(db, 'users', userId), { status, updatedAt: Timestamp.now() })
  }

  const updateRole = async (userId: string, role: UserRole) => {
    await updateDoc(doc(db, 'users', userId), { role, updatedAt: Timestamp.now() })

    // Sync to agents collection
    try {
      const userSnap = await getDoc(doc(db, 'users', userId))
      const userData = userSnap.data()
      if (!userData?.email) return

      const existing = await getDocs(query(collection(db, 'agents'), where('email', '==', userData.email)))

      if (role === 'agent') {
        if (existing.empty) {
          // Create a new agent entry with default permissions
          await addDoc(collection(db, 'agents'), {
            name: userData.fullName || userData.displayName || userData.email,
            email: userData.email,
            status: 'active',
            permissions: ['transactions'],
            createdAt: Timestamp.now(),
          })
        } else {
          // Reactivate if suspended
          await updateDoc(existing.docs[0].ref, { status: 'active', updatedAt: Timestamp.now() })
        }
      } else {
        // Role changed away from agent — suspend the agents entry
        existing.forEach(d => updateDoc(d.ref, { status: 'suspended', updatedAt: Timestamp.now() }))
      }
    } catch (e) {
      console.warn('[updateRole] agents sync failed:', e)
    }
  }

  return { users, loading, error, updateStatus, updateRole }
}
