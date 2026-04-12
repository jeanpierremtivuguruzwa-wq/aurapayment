export interface PaymentMethod {
  id: string
  name: string
  type: 'bank' | 'mobile' | 'cash'
  currency: string
  active: boolean
  totalReceived: number
}