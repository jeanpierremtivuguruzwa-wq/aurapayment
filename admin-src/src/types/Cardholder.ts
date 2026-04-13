export interface Cardholder {
  id: string
  paymentMethodId: string // Reference to PaymentMethod
  displayName: string // e.g., "Peter", "Stiles"
  status: 'active' | 'inactive'
  
  // Account details
  accountHolder: string // Full name
  accountNumber?: string
  phoneNumber?: string
  
  // Balance and transactions
  balance: number // Total amount received
  transactionsCount?: number // Number of transactions
  
  createdAt?: any
  updatedAt?: any
}
