import React, { useState } from 'react'
import { useAdminNotifications } from '../../hooks/useAdminNotifications'
import { markNotificationAsRead } from '../../services/transactionService'

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount } = useAdminNotifications()
  const [isOpen, setIsOpen] = useState(false)

  const handleMarkRead = async (id: string) => {
    await markNotificationAsRead(id)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-2xl focus:outline-none"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full px-1.5">
            {unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-10 border">
          <div className="p-2 font-semibold border-b">Notifications</div>
          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && <li className="p-3 text-gray-500 text-sm">No notifications</li>}
            {notifications.map(notif => (
              <li key={notif.id} className={`p-3 border-b text-sm ${!notif.read ? 'bg-blue-50' : ''}`}>
                <div>{notif.message}</div>
                <div className="text-xs text-gray-500 mt-1">{new Date(notif.timestamp).toLocaleString()}</div>
                {!notif.read && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    className="text-blue-600 text-xs mt-1"
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default NotificationBell