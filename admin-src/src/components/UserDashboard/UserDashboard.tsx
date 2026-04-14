import React from 'react'

const UserDashboard: React.FC = () => {
  return (
    <div className="flex flex-col h-full min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Public User Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live view of the user-facing dashboard</p>
        </div>
        <a
          href="/dashboard.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition-colors"
        >
          <span>↗</span>
          Open in new tab
        </a>
      </div>
      <iframe
        src="/dashboard.html"
        title="User Dashboard"
        className="flex-1 w-full border-0"
        style={{ minHeight: 'calc(100vh - 80px)' }}
      />
    </div>
  )
}

export default UserDashboard
