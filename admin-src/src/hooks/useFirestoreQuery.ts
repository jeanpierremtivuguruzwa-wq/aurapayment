import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../services/firebase'

export function useFirestoreQuery<T>(collectionName: string, orderByField: string = 'timestamp') {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: T[] = []
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() } as T))
      setData(items)
      setLoading(false)
    })
    return unsubscribe
  }, [collectionName, orderByField])

  return { data, loading }
}