export interface Transaction {
  id: string
  orderId?: string
  amountSent: number
  currencySent: string
  amountReceived?: number
  currencyReceived?: string
  recipientName?: string
  provider?: string
  paymentMethod?: string
  userId?: string
  proofFileName?: string
  status: 'pending' | 'uploaded' | 'completed'
  timestamp: any
}