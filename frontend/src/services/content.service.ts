import { apiClient } from './api.client'

export interface Content {
  _id: string
  userId: string
  type: 'youtube' | 'pdf' | 'docx' | 'txt'
  title: string
  description?: string
  sourceUrl?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processingStages: {
    transcription: ProcessingStage
    vectorization: ProcessingStage
    summarization: ProcessingStage
    flashcardGeneration: ProcessingStage
    quizGeneration: ProcessingStage
  }
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface ProcessingStage {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
}

export const contentService = {
  async uploadYouTube(url: string, title: string): Promise<any> {
    return apiClient.post('/contents/upload-youtube', { url, title })
  },

  async uploadDocument(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post('/contents/upload-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
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
}
