export function formatCurrency(amount: number, currency: string = 'RUB'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString()
}