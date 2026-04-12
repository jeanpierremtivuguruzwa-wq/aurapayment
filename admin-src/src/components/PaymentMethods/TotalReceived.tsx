import React, { useEffect, useState } from 'react'
import { listenToPaymentMethodTotal } from '../../services/paymentMethodService'

interface Props {
  id: string
  initialTotal: number
}

const TotalReceived: React.FC<Props> = ({ id, initialTotal }) => {
  const [total, setTotal] = useState(initialTotal)

  useEffect(() => {
    const unsubscribe = listenToPaymentMethodTotal(id, (newTotal) => setTotal(newTotal))
    return () => unsubscribe()
  }, [id])

  return <span>Total received: {total}</span>
}

export default TotalReceived