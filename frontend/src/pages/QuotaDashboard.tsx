import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart3,
  Zap,
  PauseCircle,
} from 'lucide-react'
import { quotaService, QuotaUsageResponse } from '../services/quota.service'

export const QuotaDashboard = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quotaData, setQuotaData] = useState<QuotaUsageResponse | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchQuotaData = async () => {
    try {
      setError(null)
      const data = await quotaService.getQuotaUsage()
      setQuotaData(data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load quota data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchQuotaData()

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchQuotaData, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchQuotaData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading quota data...</p>
        </div>
      </div>
    )
  }

  if (error || !quotaData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
            Failed to Load Quota Data
          </h2>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const { gemini, overall, recentErrors, pausedContent } = quotaData

  // Determine status color
  const getStatusColor = (percentUsed: number) => {
    if (percentUsed >= 90) return 'red'
    if (percentUsed >= 70) return 'orange'
    if (percentUsed >= 50) return 'yellow'
    return 'green'
  }

  const statusColor = getStatusColor(gemini.percentUsed)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Quota Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Monitor your API usage and quota limits
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Warning Banner for High Usage or Paused Content */}
        {(gemini.percentUsed >= 80 || pausedContent > 0) && (
          <div
            className={`mb-6 p-4 rounded-lg border-l-4 ${
              gemini.percentUsed >= 90
                ? 'bg-red-50 border-red-500'
                : 'bg-orange-50 border-orange-500'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  gemini.percentUsed >= 90 ? 'text-red-600' : 'text-orange-600'
                }`}
              />
              <div className="flex-1">
                <h3
                  className={`text-sm font-semibold mb-1 ${
                    gemini.percentUsed >= 90 ? 'text-red-900' : 'text-orange-900'
                  }`}
                >
                  {gemini.percentUsed >= 90
                    ? '⚠️ Critical: Quota Nearly Exhausted'
                    : '📊 Warning: High Quota Usage'}
                </h3>
                <p
                  className={`text-sm ${
                    gemini.percentUsed >= 90 ? 'text-red-800' : 'text-orange-800'
                  }`}
                >
                  You've used {gemini.percentUsed.toFixed(1)}% of your daily quota (
                  {gemini.todayCount}/{gemini.quotaLimit} requests).
                  {pausedContent > 0 && (
                    <span>
                      {' '}
                      <strong>{pausedContent}</strong> content item{pausedContent !== 1 ? 's are' : ' is'} currently paused.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Daily Usage Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-700">Daily Usage</h3>
              </div>
            </div>
            <div className="mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">
                  {gemini.todayCount}
                </span>
                <span className="text-gray-500">/ {gemini.quotaLimit}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {gemini.remainingRequests} requests remaining
              </p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  statusColor === 'red'
                    ? 'bg-red-500'
                    : statusColor === 'orange'
                    ? 'bg-orange-500'
                    : statusColor === 'yellow'
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(gemini.percentUsed, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {gemini.percentUsed.toFixed(1)}% used
            </p>
          </div>

          {/* Hourly Usage Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-700">Hourly Usage</h3>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">
                {gemini.hourlyCount}
              </span>
              <p className="text-sm text-gray-500 mt-1">Requests last hour</p>
            </div>
            {gemini.hourlyCount >= 5 && (
              <p className="text-xs text-orange-600 mt-3">
                ⚠️ High hourly usage detected
              </p>
            )}
          </div>

          {/* Success Rate Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-700">Success Rate</h3>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">
                {overall.successRate.toFixed(1)}%
              </span>
              <p className="text-sm text-gray-500 mt-1">
                {overall.totalRequests} total requests (24h)
              </p>
            </div>
            {overall.successRate < 90 && (
              <p className="text-xs text-red-600 mt-3">
                ⚠️ Success rate below optimal
              </p>
            )}
          </div>

          {/* Paused Content Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <PauseCircle className="w-5 h-5 text-orange-600" />
              <h3 className="font-semibold text-gray-700">Paused Content</h3>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">{pausedContent}</span>
              <p className="text-sm text-gray-500 mt-1">Awaiting quota reset</p>
            </div>
            {pausedContent > 0 && (
              <Link
                to="/dashboard"
                className="text-xs text-blue-600 hover:text-blue-700 mt-3 inline-block"
              >
                View paused content →
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Request Breakdown & Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request Type Breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Request Breakdown (Today)
                </h3>
              </div>
              
              <div className="space-y-3">
                {gemini.requestsByType.length > 0 ? (
                  gemini.requestsByType.map((item) => {
                    const percentage = (item.count / gemini.todayCount) * 100
                    return (
                      <div key={item.type}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 capitalize">
                            {item.type.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="text-sm text-gray-600">
                            {item.count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-gray-500 text-center py-4">
                    No requests today yet
                  </p>
                )}
              </div>
            </div>

            {/* Performance Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Performance (Last 24h)
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Avg Response Time</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {overall.avgResponseTime.toFixed(0)}ms
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Peak Hour</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {overall.peakHour.hour}:00
                  </p>
                  <p className="text-xs text-gray-500">
                    {overall.peakHour.count} requests
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Failed Requests</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {gemini.recentFailures}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Quota Exceeded</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {gemini.quotaExceededCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Errors */}
            {recentErrors.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Recent Errors</h3>
                </div>

                <div className="space-y-3">
                  {recentErrors.map((error, index) => (
                    <div
                      key={index}
                      className="p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-sm font-medium text-red-900 capitalize">
                          {error.requestType.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="text-xs text-red-600">
                          {new Date(error.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-red-700">{error.errorMessage}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Recommendations & Info */}
          <div className="space-y-6">
            {/* Quota Reset Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-2">Quota Reset</h3>
              <p className="text-sm text-blue-800 mb-3">
                Your quota will reset in approximately:
              </p>
              <p className="text-2xl font-bold text-blue-900 mb-1">
                {gemini.estimatedTimeToReset}
              </p>
              <p className="text-xs text-blue-700">
                Resets at midnight Pacific Time
              </p>
            </div>

            {/* Recommendations */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">💡 Recommendations</h3>
              
              <div className="space-y-3">
                {gemini.recommendations.map((rec, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                  >
                    <p className="text-sm text-gray-700">{rec}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Upgrade CTA (if near limit) */}
            {gemini.percentUsed >= 70 && (
              <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg p-6 text-white">
                <h3 className="font-semibold mb-2">Need More Quota?</h3>
                <p className="text-sm mb-4 opacity-90">
                  Upgrade to a paid Google AI plan for higher limits and faster processing.
                </p>
                <a
                  href="https://cloud.google.com/ai/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-4 py-2 bg-white text-purple-600 text-center rounded-lg hover:bg-gray-100 transition font-medium"
                >
                  View Pricing
                </a>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default QuotaDashboard
