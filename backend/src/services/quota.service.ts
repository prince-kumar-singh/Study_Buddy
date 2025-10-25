import { ApiRequestLog, IApiRequestLog } from '../models/ApiRequestLog.model'
import { Content } from '../models/Content.model'
import mongoose from 'mongoose'

interface QuotaStats {
  provider: string
  todayCount: number
  hourlyCount: number
  last24Hours: number
  quotaLimit: number
  percentUsed: number
  remainingRequests: number
  estimatedTimeToReset: string
  requestsByType: {
    type: string
    count: number
  }[]
  recentFailures: number
  quotaExceededCount: number
  avgResponseTime?: number
  recommendations: string[]
}

interface QuotaUsageResponse {
  gemini: QuotaStats
  overall: {
    totalRequests: number
    successRate: number
    avgResponseTime: number
    peakHour: { hour: number; count: number }
  }
  recentErrors: Array<{
    timestamp: Date
    requestType: string
    errorMessage: string
  }>
}

class QuotaService {
  // Google Gemini free tier limits
  private readonly GEMINI_DAILY_LIMIT = 50
  private readonly GEMINI_HOURLY_LIMIT = 10 // conservative estimate

  /**
   * Log an API request to the database
   */
  async logApiRequest(data: Partial<IApiRequestLog>): Promise<void> {
    try {
      await ApiRequestLog.create({
        ...data,
        timestamp: new Date()
      })
    } catch (error) {
      console.error('Failed to log API request:', error)
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  /**
   * Get quota usage statistics for a user
   */
  async getQuotaUsage(userId: string): Promise<QuotaUsageResponse> {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get Gemini stats
    const geminiStats = await this.getProviderStats(userId, 'gemini', startOfDay, oneHourAgo, twentyFourHoursAgo)
    
    // Get overall stats
    const overallStats = await this.getOverallStats(userId, twentyFourHoursAgo)
    
    // Get recent errors
    const recentErrors = await this.getRecentErrors(userId, 5)

    return {
      gemini: geminiStats,
      overall: overallStats,
      recentErrors
    }
  }

  private async getProviderStats(
    userId: string,
    provider: string,
    startOfDay: Date,
    oneHourAgo: Date,
    twentyFourHoursAgo: Date
  ): Promise<QuotaStats> {
    // Count today's requests
    const todayCount = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      timestamp: { $gte: startOfDay }
    })

    // Count last hour
    const hourlyCount = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      timestamp: { $gte: oneHourAgo }
    })

    // Count last 24 hours
    const last24Hours = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      timestamp: { $gte: twentyFourHoursAgo }
    })

    // Get requests by type
    const requestsByType = await ApiRequestLog.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          apiProvider: provider,
          timestamp: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: '$requestType',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          type: '$_id',
          count: 1
        }
      }
    ])

    // Count recent failures
    const recentFailures = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      status: 'failure',
      timestamp: { $gte: twentyFourHoursAgo }
    })

    // Count quota exceeded errors
    const quotaExceededCount = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      status: 'quota_exceeded',
      timestamp: { $gte: startOfDay }
    })

    // Calculate average response time
    const avgResponseTimeResult = await ApiRequestLog.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          apiProvider: provider,
          timestamp: { $gte: startOfDay },
          requestDuration: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$requestDuration' }
        }
      }
    ])

    const quotaLimit = provider === 'gemini' ? this.GEMINI_DAILY_LIMIT : 100
    const percentUsed = (todayCount / quotaLimit) * 100
    const remainingRequests = Math.max(0, quotaLimit - todayCount)

    // Calculate time to reset (midnight Pacific Time)
    const now = new Date()
    const tomorrowPST = new Date(now)
    tomorrowPST.setHours(24, 0, 0, 0) // midnight next day
    const hoursToReset = Math.ceil((tomorrowPST.getTime() - now.getTime()) / (1000 * 60 * 60))

    const recommendations = this.generateRecommendations(
      todayCount,
      quotaLimit,
      hourlyCount,
      quotaExceededCount
    )

    return {
      provider,
      todayCount,
      hourlyCount,
      last24Hours,
      quotaLimit,
      percentUsed: Math.round(percentUsed * 100) / 100,
      remainingRequests,
      estimatedTimeToReset: `${hoursToReset} hour${hoursToReset !== 1 ? 's' : ''}`,
      requestsByType,
      recentFailures,
      quotaExceededCount,
      avgResponseTime: avgResponseTimeResult[0]?.avgDuration || undefined,
      recommendations
    }
  }

  private async getOverallStats(userId: string, twentyFourHoursAgo: Date) {
    // Total requests last 24h
    const totalRequests = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      timestamp: { $gte: twentyFourHoursAgo }
    })

    // Success count
    const successCount = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      timestamp: { $gte: twentyFourHoursAgo },
      status: 'success'
    })

    // Calculate success rate
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100

    // Average response time
    const avgResponseTimeResult = await ApiRequestLog.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          timestamp: { $gte: twentyFourHoursAgo },
          requestDuration: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$requestDuration' }
        }
      }
    ])

    // Peak hour analysis
    const peakHourResult = await ApiRequestLog.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          timestamp: { $gte: twentyFourHoursAgo }
        }
      },
      {
        $project: {
          hour: { $hour: '$timestamp' }
        }
      },
      {
        $group: {
          _id: '$hour',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 1
      }
    ])

    return {
      totalRequests,
      successRate: Math.round(successRate * 100) / 100,
      avgResponseTime: avgResponseTimeResult[0]?.avgDuration || 0,
      peakHour: peakHourResult[0] 
        ? { hour: peakHourResult[0]._id, count: peakHourResult[0].count }
        : { hour: 0, count: 0 }
    }
  }

  private async getRecentErrors(userId: string, limit: number = 5) {
    const errors = await ApiRequestLog.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: { $in: ['failure', 'quota_exceeded'] }
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('timestamp requestType errorMessage')

    return errors.map(error => ({
      timestamp: error.timestamp,
      requestType: error.requestType,
      errorMessage: error.errorMessage || 'Unknown error'
    }))
  }

  private generateRecommendations(
    todayCount: number,
    quotaLimit: number,
    hourlyCount: number,
    quotaExceededCount: number
  ): string[] {
    const recommendations: string[] = []
    const percentUsed = (todayCount / quotaLimit) * 100

    if (percentUsed >= 90) {
      recommendations.push('⚠️ You\'re near your daily quota limit. Consider upgrading to a paid plan.')
      recommendations.push('💡 Batch process multiple documents to optimize API usage.')
    } else if (percentUsed >= 70) {
      recommendations.push('📊 You\'ve used 70%+ of your daily quota. Monitor usage carefully.')
    } else if (percentUsed < 30) {
      recommendations.push('✅ You have plenty of quota remaining for today.')
    }

    if (hourlyCount >= 5) {
      recommendations.push('🕒 High hourly usage detected. Spread out processing to avoid rate limits.')
    }

    if (quotaExceededCount > 0) {
      recommendations.push('🔴 Quota exceeded errors detected today. Processing has been paused and will auto-resume.')
    }

    if (todayCount === 0) {
      recommendations.push('🎯 No API requests today. Upload content to start learning!')
    }

    return recommendations
  }

  /**
   * Get paused content count due to quota issues
   */
  async getPausedContentCount(userId: string): Promise<number> {
    return await Content.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'paused'
    })
  }

  /**
   * Check if user can make more API requests
   */
  async canMakeRequest(userId: string, provider: string = 'gemini'): Promise<{
    canProceed: boolean
    reason?: string
  }> {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    const todayCount = await ApiRequestLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      apiProvider: provider,
      timestamp: { $gte: startOfDay }
    })

    const quotaLimit = provider === 'gemini' ? this.GEMINI_DAILY_LIMIT : 100

    if (todayCount >= quotaLimit) {
      return {
        canProceed: false,
        reason: `Daily quota limit of ${quotaLimit} requests reached. Resets at midnight Pacific Time.`
      }
    }

    return { canProceed: true }
  }
}

export const quotaService = new QuotaService()
