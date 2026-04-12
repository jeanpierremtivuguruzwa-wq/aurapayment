import React from 'react'

interface Props {
  id: string
  urgent: boolean
  onToggle: (id: string, urgent: boolean) => void
}

const UrgencyToggle: React.FC<Props> = ({ id, urgent, onToggle }) => {
  return (
    <label className="flex items-center gap-1 text-sm">
      <input
        type="checkbox"
        checked={urgent}
        onChange={(e) => onToggle(id, e.target.checked)}
      />
      Urgent
    </label>
  )
}

export default UrgencyToggle