import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy, Query, CollectionReference } from 'firebase/firestore'
import { db } from '../services/firebase'

export function useFirestoreQuery<T>(collectionName: string, orderByField?: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      let q: Query<any>
      const col = collection(db, collectionName) as CollectionReference<any>
      
      if (orderByField) {
        q = query(col, orderBy(orderByField, 'desc'))
      } else {
        q = query(col)
      }
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: T[] = []
          snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() } as T))
          setData(items)
          setLoading(false)
          setError(null)
        },
        (err) => {
          console.error('Error fetching data:', err)
          setError(err.message)
          setLoading(false)
          // Still show data even if ordering fails
          const col = collection(db, collectionName) as CollectionReference<any>
          const fallbackQ = query(col)
          onSnapshot(fallbackQ, (snapshot) => {
            const items: T[] = []
            snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() } as T))
            setData(items)
          })
        }
      )
      return unsubscribe
    } catch (err) {
      console.error('Error in useFirestoreQuery:', err)
      setError((err as Error).message)
      setLoading(false)
    }
  }, [collectionName, orderByField])

  return { data, loading, error }
}