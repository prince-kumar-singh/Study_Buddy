import { apiClient } from './api.client'

export interface Content {
  _id: string
  userId: string
  type: 'youtube' | 'pdf' | 'docx' | 'txt'
  title: string
  description?: string
  sourceUrl?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  processingStages: {
    transcription: ProcessingStage
    vectorization: ProcessingStage
    summarization: ProcessingStage
    flashcardGeneration: ProcessingStage
    quizGeneration: ProcessingStage
  }
  metadata?: {
    error?: string
    pausedReason?: string
    pausedAt?: string
    quotaInfo?: any
    [key: string]: any
  }
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface ProcessingStage {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  progress: number
  error?: string
  errorType?: string
  errorDetails?: {
    quotaInfo?: any
    pausedAt?: string
    message?: string
    [key: string]: any
  }
  retryCount?: number
  lastRetryAt?: string
  startedAt?: string
  completedAt?: string
}

export const contentService = {
  async uploadDocument(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('document', file)
    return apiClient.post('/contents/upload-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  async uploadTranscript(data: {
    text: string
    title?: string
    description?: string
    tags?: string
    url?: string
    author?: string
    duration?: string
    language?: string
  }): Promise<any> {
    return apiClient.post('/contents/upload-transcript', data)
  },

  async getContents(filters?: { status?: string; type?: string }): Promise<{ success: boolean; data: { contents: Content[] } }> {
    return apiClient.get('/contents', { params: filters })
  },

  async getContentById(id: string): Promise<{ success: boolean; data: { content: Content } }> {
    return apiClient.get(`/contents/${id}`)
  },

  async deleteContent(id: string): Promise<any> {
    return apiClient.delete(`/contents/${id}`)
  },

  async resumeProcessing(contentId: string, fromStage?: string): Promise<any> {
    return apiClient.post(`/contents/${contentId}/resume`, { fromStage })
  },

  async getSummaries(contentId: string): Promise<any> {
    return apiClient.get(`/contents/${contentId}/summaries`)
  },
}
