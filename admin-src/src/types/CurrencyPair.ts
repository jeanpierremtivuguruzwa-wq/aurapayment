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
}
