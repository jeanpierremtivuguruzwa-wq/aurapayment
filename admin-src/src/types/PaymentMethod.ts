export interface PaymentMethod {
  id: string
  name: string
  type: 'bank' | 'mobile' | 'cash'
  currency: string
  active: boolean
  totalReceived: number
  
  // Bank Transfer Fields
  accountNumber?: string
  accountHolder?: string
  
  // Mobile Money Fields
  phoneNumber?: string
  
  // Common
  fees?: number
  description?: string
  processingTime?: string
  createdAt?: any
}
