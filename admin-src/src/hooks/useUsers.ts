import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, doc, updateDoc, Timestamp } from 'firebase/firestore'
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
  }

  return { users, loading, error, updateStatus, updateRole }
}
