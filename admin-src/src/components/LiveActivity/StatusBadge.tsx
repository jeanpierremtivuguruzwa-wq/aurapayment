import React from 'react'
import { Transaction } from '../../types/Transaction'

interface Props {
  status: Transaction['status']
}

const StatusBadge: React.FC<Props> = ({ status }) => {
  const styles = {
    pending: 'bg-amber-100 text-amber-800',
    uploaded: 'bg-green-100 text-green-800',
    completed: 'bg-indigo-100 text-indigo-800',
  }

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export default StatusBadge