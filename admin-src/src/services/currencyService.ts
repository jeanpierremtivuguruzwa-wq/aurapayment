import { collection, doc, updateDoc, addDoc } from 'firebase/firestore'
import { db } from './firebase'
import { CurrencyPair } from '../types/CurrencyPair'

export async function updateCurrencyPair(id: string, data: Partial<CurrencyPair>) {
  await updateDoc(doc(db, 'currencyPairs', id), data)
}

export async function addCurrencyPair(pair: Omit<CurrencyPair, 'id'>) {
  await addDoc(collection(db, 'currencyPairs'), pair)
}