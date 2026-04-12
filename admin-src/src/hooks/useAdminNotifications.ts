import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../services/firebase'

interface Notification {
  id: string
  message: string
  timestamp: Date
  read: boolean
}

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'adminNotifications'), orderBy('timestamp', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = []
      let unread = 0
      snapshot.forEach(doc => {
        const data = doc.data()
        const notif = { id: doc.id, ...data } as Notification
        notifs.push(notif)
        if (!data.read) unread++
      })
      setNotifications(notifs)
      setUnreadCount(unread)
    })
    return unsubscribe
  }, [])

  return { notifications, unreadCount }
}