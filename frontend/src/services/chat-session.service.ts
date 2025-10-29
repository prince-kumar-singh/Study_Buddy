import { apiClient } from './api.client'

export interface ChatSession {
  _id: string
  contentId: string
  userId: string
  title: string
  lastMessageAt: Date
  messageCount: number
  metadata?: {
    firstQuestion?: string
    contentType?: string
    contentTitle?: string
    aiGeneratedTitle?: boolean
    tags?: string[]
  }
  tags: string[]
  folder?: string
  isShared: boolean
  shareToken?: string
  shareExpiresAt?: Date
  analytics: {
    viewCount: number
    lastViewedAt?: Date
    averageResponseTime?: number
    totalQuestions: number
  }
  isPinned: boolean
  color?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateChatSessionDTO {
  contentId: string
  title?: string
  metadata?: {
    firstQuestion?: string
    tags?: string[]
  }
}

export interface UpdateChatSessionDTO {
  title?: string
  tags?: string[]
  folder?: string
  color?: string
  isPinned?: boolean
  metadata?: {
    firstQuestion?: string
    tags?: string[]
  }
}

export interface SearchSessionsParams {
  q?: string
  tags?: string[]
  folder?: string
  contentId?: string
  isPinned?: boolean
  limit?: number
}

class ChatSessionService {
  /**
   * Create a new chat session
   */
  async createSession(data: CreateChatSessionDTO) {
    return apiClient.post('/chat-sessions', data)
  }

  /**
   * Get all sessions for a specific content
   */
  async getSessionsByContent(contentId: string) {
    return apiClient.get(`/chat-sessions?contentId=${contentId}`)
  }

  /**
   * Get a specific session by ID
   */
  async getSessionById(sessionId: string) {
    return apiClient.get(`/chat-sessions/${sessionId}`)
  }

  /**
   * Update a session (e.g., rename)
   */
  async updateSession(sessionId: string, data: UpdateChatSessionDTO) {
    return apiClient.patch(`/chat-sessions/${sessionId}`, data)
  }

  /**
   * Delete a session and all its Q&A records
   */
  async deleteSession(sessionId: string) {
    return apiClient.delete(`/chat-sessions/${sessionId}`)
  }

  /**
   * Generate AI title for session
   */
  async generateAITitle(sessionId: string) {
    return apiClient.post(`/chat-sessions/${sessionId}/generate-title`, {})
  }

  /**
   * Update session organization (tags, folder, color, pin)
   */
  async updateOrganization(sessionId: string, data: Partial<UpdateChatSessionDTO>) {
    return apiClient.patch(`/chat-sessions/${sessionId}/organization`, data)
  }

  /**
   * Generate share link for session
   */
  async shareSession(sessionId: string, expiresInDays?: number) {
    return apiClient.post(`/chat-sessions/${sessionId}/share`, { expiresInDays })
  }

  /**
   * Revoke share link
   */
  async unshareSession(sessionId: string) {
    return apiClient.delete(`/chat-sessions/${sessionId}/share`)
  }

  /**
   * Get shared session (no auth required)
   */
  async getSharedSession(shareToken: string) {
    return apiClient.get(`/chat-sessions/shared/${shareToken}`)
  }

  /**
   * Export session
   */
  async exportSession(sessionId: string, format: 'json' | 'txt' = 'json') {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/chat-sessions/${sessionId}/export?format=${format}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    )
    
    if (!response.ok) throw new Error('Export failed')
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${sessionId}.${format}`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  /**
   * Get session analytics
   */
  async getAnalytics(sessionId: string) {
    return apiClient.get(`/chat-sessions/${sessionId}/analytics`)
  }

  /**
   * Search/filter sessions
   */
  async searchSessions(params: SearchSessionsParams) {
    const queryParams = new URLSearchParams()
    if (params.q) queryParams.append('q', params.q)
    if (params.tags) queryParams.append('tags', params.tags.join(','))
    if (params.folder) queryParams.append('folder', params.folder)
    if (params.contentId) queryParams.append('contentId', params.contentId)
    if (params.isPinned !== undefined) queryParams.append('isPinned', String(params.isPinned))
    if (params.limit) queryParams.append('limit', String(params.limit))

    return apiClient.get(`/chat-sessions/search/query?${queryParams.toString()}`)
  }
}

export const chatSessionService = new ChatSessionService()
