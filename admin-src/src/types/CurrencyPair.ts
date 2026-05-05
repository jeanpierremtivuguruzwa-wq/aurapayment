export interface CurrencyPair {
  id: string
  from: string
  to: string
  rate: number
  urgent: boolean
  country?: string
  countryCode?: string
  flag?: string
  active?: boolean
  deliveryMethods?: string[]
  fee?: number
  feeType?: 'flat' | 'percent'

  /** Spread deducted from the market rate before saving (flat units of `to` currency) */
  spread?: number
  /** Whether spread is flat or percent */
  spreadType?: 'flat' | 'percent'
}
