import { apiClient } from './api.client'

export interface QuotaInfo {
  provider: string
  todayCount: number
  hourlyCount: number
  last24Hours: number
  quotaLimit: number
  percentUsed: number
  remainingRequests: number
  estimatedTimeToReset: string
  requestsByType: Array<{
    type: string
    count: number
  }>
  recentFailures: number
  quotaExceededCount: number
  avgResponseTime?: number
  recommendations: string[]
}

export interface OverallStats {
  totalRequests: number
  successRate: number
  avgResponseTime: number
  peakHour: {
    hour: number
    count: number
  }
}

export interface RecentError {
  timestamp: Date
  requestType: string
  errorMessage: string
}

export interface QuotaUsageResponse {
  gemini: QuotaInfo
  overall: OverallStats
  recentErrors: RecentError[]
  pausedContent: number
}

class QuotaService {
  /**
   * Get comprehensive quota usage statistics
   */
  async getQuotaUsage(): Promise<QuotaUsageResponse> {
    const response = await apiClient.get('/api/quota/usage') as any
    return response.data.data
  }

  /**
   * Check if user can make more API requests
   */
  async canMakeRequest(provider: string = 'gemini'): Promise<{
    canProceed: boolean
    reason?: string
  }> {
    const response = await apiClient.get('/api/quota/check', {
      params: { provider }
    }) as any
    return response.data.data
  }

  /**
   * Get count of paused content
   */
  async getPausedContentCount(): Promise<number> {
    const response = await apiClient.get('/api/quota/paused-content') as any
    return response.data.data.pausedCount
  }
}

export const quotaService = new QuotaService()
