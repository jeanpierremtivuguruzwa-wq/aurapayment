import { collection, doc, getDoc, updateDoc, addDoc, deleteDoc, getDocs, query, where, onSnapshot, increment, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { Cardholder } from '../types/Cardholder'
import { PaymentMethod } from '../types/PaymentMethod'
import { updateWalletBalance } from './walletService'

// Set cardholder as active (deactivate others for the same payment method)
export async function setActiveCardholder(paymentMethodId: string, cardholderId: string) {
  try {
    // Get all cardholders for this payment method
    const q = query(collection(db, 'cardholders'), where('paymentMethodId', '==', paymentMethodId))
    const snapshot = await getDocs(q)
    
    // Deactivate all cardholders for this payment method
    for (const docSnap of snapshot.docs) {
      if (docSnap.id !== cardholderId && docSnap.data().status === 'active') {
        await updateDoc(doc(db, 'cardholders', docSnap.id), { status: 'inactive' })
      }
    }
    
    // Activate the selected cardholder
    await updateDoc(doc(db, 'cardholders', cardholderId), { status: 'active' })
  } catch (error) {
    console.error('Error setting active cardholder:', error)
    throw error
  }
}

// Delete cardholder
export async function deleteCardholder(id: string) {
  await deleteDoc(doc(db, 'cardholders', id))
}

// Withdraw money from cardholder balance
export async function withdrawCardholder(id: string, amount: number, note: string) {
  if (amount <= 0) throw new Error('Withdrawal amount must be greater than 0')
  // Log the withdrawal
  await addDoc(collection(db, 'cardholderWithdrawals'), {
    cardholderId: id,
    amount,
    note: note.trim() || 'Manual withdrawal',
    createdAt: Timestamp.now(),
  })
  // Deduct from balance, add to totalWithdrawn
  await updateDoc(doc(db, 'cardholders', id), {
    balance:        increment(-amount),
    totalWithdrawn: increment(amount),
    updatedAt:      Timestamp.now(),
  })

  // ── Update AuraWallet: find cardholder's payment method currency ──────────
  try {
    const chSnap = await getDoc(doc(db, 'cardholders', id))
    if (chSnap.exists()) {
      const chData = chSnap.data() as Cardholder
      if (chData.paymentMethodId) {
        const pmSnap = await getDoc(doc(db, 'paymentMethods', chData.paymentMethodId))
        if (pmSnap.exists()) {
          const currency = (pmSnap.data() as PaymentMethod).currency
          if (currency) {
            await updateWalletBalance(currency, -amount, 'withdrawal', id, note.trim() || 'Cardholder withdrawal')
          }
        }
      }
    }
  } catch (e) {
    console.warn('Wallet update after withdrawal failed:', e)
  }
}

// Migrate existing payment methods to have cardholders if they don't already
export async function migratePaymentMethodsToCardholders() {
  try {
    // Get all payment methods
    const methodsSnapshot = await getDocs(collection(db, 'paymentMethods'))
    
    for (const methodDoc of methodsSnapshot.docs) {
      const method = methodDoc.data() as PaymentMethod
      
      // Check if this payment method already has a cardholder
      const cardholderQuery = query(
        collection(db, 'cardholders'),
        where('paymentMethodId', '==', methodDoc.id)
      )
      const cardholderSnapshot = await getDocs(cardholderQuery)
      
      // If no cardholder exists for this payment method, create one
      if (cardholderSnapshot.empty) {
        const cardholderData = {
          paymentMethodId: methodDoc.id,
          displayName: method.name, // Use payment method name as display name
          accountHolder: method.accountHolder || method.name,
          accountNumber: method.accountNumber || undefined,
          phoneNumber: method.phoneNumber || undefined,
          balance: 0,
          status: 'active', // Set as active for migrated data
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        // Remove undefined fields
        const cleanedData = Object.fromEntries(
          Object.entries(cardholderData).filter(([_, value]) => value !== undefined)
        )
        
        await addDoc(collection(db, 'cardholders'), cleanedData)
        console.log(`Created cardholder for payment method: ${method.name}`)
      }
    }
    
    console.log('Payment method migration completed')
  } catch (error) {
    console.error('Error migrating payment methods:', error)
  }
}

// Clean up duplicate cardholders for a payment method (keep only 1 per method)
export async function cleanupDuplicateCardholders() {
  try {
    // Get all payment methods
    const methodsSnapshot = await getDocs(collection(db, 'paymentMethods'))
    let deletedCount = 0
    
    for (const methodDoc of methodsSnapshot.docs) {
      // Get all cardholders for this payment method
      const cardholderQuery = query(
        collection(db, 'cardholders'),
        where('paymentMethodId', '==', methodDoc.id)
      )
      const cardholderSnapshot = await getDocs(cardholderQuery)
      
      // If more than 1 cardholder exists, delete the extras (keep only the first one)
      if (cardholderSnapshot.docs.length > 1) {
        console.log(`Found ${cardholderSnapshot.docs.length} cardholders for method ${methodDoc.id}, keeping 1...`)
        
        // Keep the first one, delete all others
        const cardholderDocs = cardholderSnapshot.docs
        for (let i = 1; i < cardholderDocs.length; i++) {
          await deleteDoc(doc(db, 'cardholders', cardholderDocs[i].id))
          deletedCount++
          console.log(`Deleted duplicate cardholder: ${cardholderDocs[i].id}`)
        }
        
        // Ensure the first one is active
        await updateDoc(doc(db, 'cardholders', cardholderDocs[0].id), { 
          status: 'active',
          updatedAt: new Date()
        })
      }
    }
    
    console.log(`Cleanup completed. Deleted ${deletedCount} duplicate cardholders.`)
    return deletedCount
  } catch (error) {
    console.error('Error cleaning up duplicate cardholders:', error)
    throw error
  }
}

// Force reset - delete all cardholders and recreate from payment methods
export async function forceResetCardholders() {
  try {
    console.log('Starting force reset...')
    
    // Delete all existing cardholders
    const allCardholders = await getDocs(collection(db, 'cardholders'))
    console.log(`Step 1: Deleting ${allCardholders.docs.length} existing cardholders...`)
    
    for (const doc_ of allCardholders.docs) {
      console.log(`Deleting cardholder: ${doc_.id}`)
      await deleteDoc(doc(db, 'cardholders', doc_.id))
    }
    
    // Add small delay to ensure deletes are processed
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Verify all are deleted
    const verifyDelete = await getDocs(collection(db, 'cardholders'))
    console.log(`Step 2: Verified ${verifyDelete.docs.length} cardholders remaining (should be 0)`)
    
    // Now recreate from payment methods
    const methodsSnapshot = await getDocs(collection(db, 'paymentMethods'))
    console.log(`Step 3: Found ${methodsSnapshot.docs.length} payment methods`)
    let createdCount = 0
    
    for (const methodDoc of methodsSnapshot.docs) {
      const method = methodDoc.data() as PaymentMethod
      
      const cardholderData = {
        paymentMethodId: methodDoc.id,
        displayName: method.name,
        accountHolder: method.accountHolder || method.name,
        accountNumber: method.accountNumber || undefined,
        phoneNumber: method.phoneNumber || undefined,
        balance: 0,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      // Remove undefined fields
      const cleanedData = Object.fromEntries(
        Object.entries(cardholderData).filter(([_, value]) => value !== undefined)
      )
      
      const newDoc = await addDoc(collection(db, 'cardholders'), cleanedData)
      createdCount++
      console.log(`Created cardholder ${createdCount}: ${method.name} (ID: ${newDoc.id})`)
    }
    
    console.log(`Reset completed. Created ${createdCount} cardholders.`)
    return createdCount
  } catch (error) {
    console.error('Error resetting cardholders:', error)
    throw error
  }
}

// Add new cardholder
export async function addCardholder(cardholder: Omit<Cardholder, 'id'>) {
  const cleanedCardholder = Object.fromEntries(
    Object.entries(cardholder).filter(([_, value]) => value !== undefined)
  )
  return await addDoc(collection(db, 'cardholders'), {
    ...cleanedCardholder,
    createdAt: new Date(),
    updatedAt: new Date()
  })
}

// Update cardholder
export async function updateCardholder(id: string, updates: Partial<Cardholder>) {
  const cleanedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  )
  await updateDoc(doc(db, 'cardholders', id), {
    ...cleanedUpdates,
    updatedAt: new Date()
  })
}

// Get cardholders for a payment method
export function listenToCardholders(paymentMethodId: string, callback: (cardholders: Cardholder[]) => void) {
  const q = query(collection(db, 'cardholders'), where('paymentMethodId', '==', paymentMethodId))
  return onSnapshot(q, (snapshot) => {
    const cardholders: Cardholder[] = []
    snapshot.forEach(doc => {
      cardholders.push({ id: doc.id, ...doc.data() } as Cardholder)
    })
    callback(cardholders)
  })
}

// Get active cardholder for a payment method
export function listenToActiveCardholder(paymentMethodId: string, callback: (cardholder: Cardholder | null) => void) {
  const q = query(
    collection(db, 'cardholders'),
    where('paymentMethodId', '==', paymentMethodId),
    where('status', '==', 'active')
  )
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const doc = snapshot.docs[0]
      callback({ id: doc.id, ...doc.data() } as Cardholder)
    } else {
      callback(null)
    }
  })
}

// Find cardholder by display name (for auto-selection)
export async function findCardholderByDisplayName(paymentMethodId: string, displayName: string): Promise<Cardholder | null> {
  const q = query(
    collection(db, 'cardholders'),
    where('paymentMethodId', '==', paymentMethodId),
    where('displayName', '==', displayName),
    where('status', '==', 'active')
  )
  const snapshot = await getDocs(q)
  
  if (!snapshot.empty) {
    const doc = snapshot.docs[0]
    return { id: doc.id, ...doc.data() } as Cardholder
  }
  return null
}
