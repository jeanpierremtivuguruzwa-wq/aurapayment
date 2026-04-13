import { useEffect, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Order } from '../types/Order'

export function useRealtimeOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[Orders] snapshot size:', snapshot.size)
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[]

      // Sort newest-first client-side (no composite index required)
      ordersData.sort((a: any, b: any) => {
        const ta = a.createdAt?.seconds ?? 0
        const tb = b.createdAt?.seconds ?? 0
        return tb - ta
      })

      setOrders(ordersData)
      setLoading(false)
    }, (err) => {
      console.error('Error loading orders:', err)
      setError(err.message)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  return { orders, loading, error }
}
