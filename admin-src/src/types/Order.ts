export type OrderStatus = 'pending' | 'uploaded' | 'completed' | 'cancelled'
export type DeliveryMethod = 'bank-transfer' | 'mobile-money' | 'cash-pickup'

export interface Order {
  id: string
  orderId: string
  sendAmount: number
  sendCurrency: string
  receiveCurrency: string
  rate: number
  receiveAmount: number
  recipientName: string
  provider: string
  providerName?: string
  country?: string
  countryCode?: string
  flag?: string
  phoneNumber?: string
  accountNumber?: string
  deliveryMethod: DeliveryMethod
  userId: string
  userEmail: string
  senderName?: string
  createdAt: {
    seconds: number
    nanoseconds: number
  }
  completedAt?: {
    seconds: number
    nanoseconds: number
  }
  cancelledAt?: {
    seconds: number
    nanoseconds: number
  }
  status: OrderStatus
  paymentMethod: string
  proofFileName?: string
  // Claim system — which agent/admin took this order
  claimedBy?: string | null       // agent/admin UID or doc ID
  claimedByName?: string | null   // display name
  claimedAt?: { seconds: number; nanoseconds: number } | null
}
