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
  balance: number // Current balance (received - withdrawn)
  totalReceived?: number // Running total ever received
  totalWithdrawn?: number // Running total ever withdrawn
  transactionsCount?: number // Number of transactions
  
  createdAt?: any
  updatedAt?: any
}
