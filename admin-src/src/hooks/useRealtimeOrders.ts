import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Order } from '../types/Order'

export function useRealtimeOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[]
        setOrders(ordersData)
        setLoading(false)
      })

      return () => unsubscribe()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }, [])

  return { orders, loading, error }
}
