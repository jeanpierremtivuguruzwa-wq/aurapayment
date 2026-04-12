import { collection, doc, updateDoc, addDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { PaymentMethod } from '../types/PaymentMethod'

export async function setActivePaymentMethod(methodId: string) {
  // first unset all
  const snapshot = await getDocs(collection(db, 'paymentMethods'))
  for (const docSnap of snapshot.docs) {
    if (docSnap.id !== methodId && docSnap.data().active === true) {
      await updateDoc(doc(db, 'paymentMethods', docSnap.id), { active: false })
    }
  }
  await updateDoc(doc(db, 'paymentMethods', methodId), { active: true })
}

export async function deletePaymentMethod(id: string) {
  await deleteDoc(doc(db, 'paymentMethods', id))
}

export async function addPaymentMethod(method: Omit<PaymentMethod, 'id'>) {
  await addDoc(collection(db, 'paymentMethods'), method)
}

export function listenToPaymentMethodTotal(id: string, callback: (total: number) => void) {
  return onSnapshot(doc(db, 'paymentMethods', id), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().totalReceived || 0)
    }
  })
}