import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, doc, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Transaction } from '../types/Transaction'

export function useRealtimeTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const q = query(collection(db, 'transactions'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = []
      snapshot.forEach(doc => txs.push({ id: doc.id, ...doc.data() } as Transaction))
      // Sort newest-first client-side
      txs.sort((a: any, b: any) => {
        const ta = a.timestamp?.seconds ?? 0
        const tb = b.timestamp?.seconds ?? 0
        return tb - ta
      })
      setTransactions(txs)
    })
    return unsubscribe
  }, [])

  const updateStatus = async (id: string, status: Transaction['status']) => {
    await updateDoc(doc(db, 'transactions', id), { status })
    // create admin notification
    await addDoc(collection(db, 'adminNotifications'), {
      message: `Transaction ${id} status changed to ${status}`,
      timestamp: new Date(),
      read: false
    })
  }

  return { transactions, updateStatus }
}