import { useEffect, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../services/firebase'

interface Notification {
  id: string
  message: string
  timestamp: any
  read: boolean
}

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'adminNotifications'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = []
      let unread = 0
      snapshot.forEach(doc => {
        const data = doc.data()
        const notif = { id: doc.id, ...data } as Notification
        notifs.push(notif)
        if (!data.read) unread++
      })
      // Sort newest-first client-side
      notifs.sort((a, b) => {
        const ta = (a.timestamp?.seconds ?? 0)
        const tb = (b.timestamp?.seconds ?? 0)
        return tb - ta
      })
      setNotifications(notifs)
      setUnreadCount(unread)
    })
    return unsubscribe
  }, [])

  return { notifications, unreadCount }
}