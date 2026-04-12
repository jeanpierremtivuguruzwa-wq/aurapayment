export interface Transaction {
  id: string
  amountSent: number
  currencySent: string
  amountReceived?: number
  currencyReceived?: string
  recipientName?: string
  provider?: string          // 🆕
  paymentMethod?: string     // 🆕
  status: 'pending' | 'uploaded' | 'completed'
  timestamp: any // Firestore Timestamp or number
  // ... other fields you have
}