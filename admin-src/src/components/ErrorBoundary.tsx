import React from 'react'

interface State { hasError: boolean; error: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Section error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card-base p-6 bg-red-50 border border-red-200">
          <p className="text-red-700 font-semibold mb-1">⚠️ This section encountered an error</p>
          <p className="text-red-600 text-sm font-mono">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="mt-4 btn-primary text-sm"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
