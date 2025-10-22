import { apiClient } from './api.client'

export interface QAQuestion {
  contentId: string
  question: string
}

export interface QAResponse {
  success: boolean
  data: {
    qa: {
      id: string
      question: string
      answer: string
      sourceSegments: Array<{
        startTime: number
        endTime: number
        relevance: number
      }>
      createdAt: string
    }
  }
}

export interface QAHistory {
  _id: string
  contentId: string
  userId: string
  question: string
  answer: string
  sourceSegments: Array<{
    startTime: number
    endTime: number
    relevance: number
  }>
  createdAt: string
}

export const qaService = {
  async askQuestion(data: QAQuestion): Promise<QAResponse> {
    return apiClient.post('/qa/ask', data)
  },

  async getHistory(contentId: string): Promise<{ success: boolean; data: { qas: QAHistory[] } }> {
    return apiClient.get(`/qa/history/${contentId}`)
  },
}
