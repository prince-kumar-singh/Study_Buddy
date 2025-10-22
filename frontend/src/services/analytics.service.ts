import { apiClient } from './api.client'

export const analyticsService = {
  async getProgress(): Promise<any> {
    return apiClient.get('/analytics/progress')
  },

  async getStats(): Promise<any> {
    return apiClient.get('/analytics/stats')
  },
}
