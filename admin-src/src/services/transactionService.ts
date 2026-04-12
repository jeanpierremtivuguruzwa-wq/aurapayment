import { collection, doc, updateDoc, addDoc } from 'firebase/firestore'
import { db } from './firebase'

export async function updateTransactionStatus(id: string, status: string) {
  await updateDoc(doc(db, 'transactions', id), { status })
  await addDoc(collection(db, 'adminNotifications'), {
    message: `Transaction ${id} status changed to ${status}`,
    timestamp: new Date(),
    read: false
  })
}

export async function markNotificationAsRead(id: string) {
  await updateDoc(doc(db, 'adminNotifications', id), { read: true })
}