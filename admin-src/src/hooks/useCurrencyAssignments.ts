import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, query,
  doc, setDoc, updateDoc, arrayUnion, arrayRemove
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { Cardholder } from '../types/Cardholder'
import { PaymentMethod } from '../types/PaymentMethod'

export interface CurrencyAssignment {
  currency: string
  receivesIds: string[]           // explicit list of assigned cardholders for receiving
  payoutsIds: string[]            // explicit list of assigned cardholders for payouts
  receiveDefaultId: string | null // which one is default
  payoutDefaultId: string | null
}

// Cardholder enriched with its payment method data
export interface EnrichedCardholder extends Cardholder {
  method: PaymentMethod | null
}

export function useCurrencyAssignments() {
  const [assignments, setAssignments] = useState<CurrencyAssignment[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [cardholders, setCardholders] = useState<Cardholder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let a = false, b = false, c = false
    const done = () => { if (a && b && c) setLoading(false) }

    const u1 = onSnapshot(query(collection(db, 'currencyAssignments')), snap => {
      setAssignments(snap.docs.map(d => {
        const data = d.data()
        return {
          currency: d.id,
          receivesIds: data.receivesIds ?? [],
          payoutsIds: data.payoutsIds ?? [],
          receiveDefaultId: data.receiveDefaultId ?? null,
          payoutDefaultId: data.payoutDefaultId ?? null,
        } as CurrencyAssignment
      }))
      a = true; done()
    }, err => { console.error('[CurrencyAssignments]', err); a = true; done() })

    const u2 = onSnapshot(query(collection(db, 'paymentMethods')), snap => {
      setMethods(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PaymentMethod))
      b = true; done()
    }, err => { console.error('[PaymentMethods]', err); b = true; done() })

    const u3 = onSnapshot(query(collection(db, 'cardholders')), snap => {
      setCardholders(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Cardholder))
      c = true; done()
    }, err => { console.error('[Cardholders]', err); c = true; done() })

    return () => { u1(); u2(); u3() }
  }, [])

  // All unique currencies from assignments only (explicit, admin-managed)
  const currencies = assignments.map(a => a.currency).sort()

  // All cardholders list (enriched with method)
  const allCardholders: EnrichedCardholder[] = cardholders.map(ch => ({
    ...ch,
    method: methods.find(m => m.id === ch.paymentMethodId) ?? null,
  }))

  const getCardholder = (id: string): EnrichedCardholder | undefined =>
    allCardholders.find(ch => ch.id === id)

  const getAssignment = (currency: string): CurrencyAssignment =>
    assignments.find(a => a.currency === currency) ?? {
      currency,
      receivesIds: [],
      payoutsIds: [],
      receiveDefaultId: null,
      payoutDefaultId: null,
    }

  const ensureDoc = async (currency: string) => {
    const ref = doc(db, 'currencyAssignments', currency)
    const existing = assignments.find(a => a.currency === currency)
    if (!existing) {
      await setDoc(ref, { receivesIds: [], payoutsIds: [], receiveDefaultId: null, payoutDefaultId: null })
    }
    return ref
  }

  const addCardholderToRole = async (currency: string, role: 'receive' | 'payout', cardholderId: string) => {
    const ref = await ensureDoc(currency)
    const field = role === 'receive' ? 'receivesIds' : 'payoutsIds'
    await updateDoc(ref, { [field]: arrayUnion(cardholderId) })
  }

  const removeCardholderFromRole = async (currency: string, role: 'receive' | 'payout', cardholderId: string) => {
    const ref = doc(db, 'currencyAssignments', currency)
    const field = role === 'receive' ? 'receivesIds' : 'payoutsIds'
    const defaultField = role === 'receive' ? 'receiveDefaultId' : 'payoutDefaultId'
    const assignment = getAssignment(currency)
    const update: Record<string, any> = { [field]: arrayRemove(cardholderId) }
    // Clear default if the removed cardholder was the default
    if (assignment[defaultField as keyof CurrencyAssignment] === cardholderId) {
      update[defaultField] = null
    }
    await updateDoc(ref, update)
  }

  const setDefault = async (currency: string, role: 'receive' | 'payout', cardholderId: string) => {
    const field = role === 'receive' ? 'receiveDefaultId' : 'payoutDefaultId'
    const ref = doc(db, 'currencyAssignments', currency)
    await updateDoc(ref, { [field]: cardholderId })
  }

  const addCurrency = async (currency: string) => {
    const code = currency.trim().toUpperCase()
    if (!code) return
    const ref = doc(db, 'currencyAssignments', code)
    await setDoc(ref, {
      receivesIds: [],
      payoutsIds: [],
      receiveDefaultId: null,
      payoutDefaultId: null,
    }, { merge: true })
  }

  return {
    currencies,
    allCardholders,
    getCardholder,
    getAssignment,
    loading,
    setDefault,
    addCurrency,
    addCardholderToRole,
    removeCardholderFromRole,
  }
}
