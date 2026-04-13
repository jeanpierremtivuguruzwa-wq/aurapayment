import { collection, doc, updateDoc, addDoc, deleteDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
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

export async function deactivatePaymentMethod(methodId: string) {
  await updateDoc(doc(db, 'paymentMethods', methodId), { active: false })
}

export async function deletePaymentMethod(id: string) {
  // Delete the linked cardholder first
  const q = query(collection(db, 'cardholders'), where('paymentMethodId', '==', id))
  const snapshot = await getDocs(q)
  for (const cardDoc of snapshot.docs) {
    await deleteDoc(doc(db, 'cardholders', cardDoc.id))
  }
  await deleteDoc(doc(db, 'paymentMethods', id))
}

export async function addPaymentMethod(method: Omit<PaymentMethod, 'id'>) {
  // Remove undefined fields - Firestore doesn't allow undefined values
  const cleanedMethod = Object.fromEntries(
    Object.entries(method).filter(([_, value]) => value !== undefined)
  )
  const docRef = await addDoc(collection(db, 'paymentMethods'), cleanedMethod)

  // Auto-create the linked cardholder (1-to-1 relationship)
  const cardholderData: Record<string, any> = {
    paymentMethodId: docRef.id,
    displayName: method.name,
    accountHolder: method.accountHolder || method.name,
    balance: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  if (method.accountNumber) cardholderData.accountNumber = method.accountNumber
  if (method.phoneNumber) cardholderData.phoneNumber = method.phoneNumber

  await addDoc(collection(db, 'cardholders'), cardholderData)

  return docRef.id
}

export function listenToPaymentMethodTotal(id: string, callback: (total: number) => void) {
  return onSnapshot(doc(db, 'paymentMethods', id), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().totalReceived || 0)
    }
  })
}