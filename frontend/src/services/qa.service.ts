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

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (data: { sourceSegments: any[], qaId: string, createdAt: string }) => void
  onError: (error: string) => void
}

export const qaService = {
  async askQuestion(data: QAQuestion): Promise<QAResponse> {
    return apiClient.post('/qa/ask', data)
  },

  async getHistory(contentId: string): Promise<{ success: boolean; data: { qas: QAHistory[] } }> {
    return apiClient.get(`/qa/history/${contentId}`)
  },

  /**
   * Ask a question with streaming support using Server-Sent Events
   */
  async askQuestionStream(
    data: QAQuestion,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // Get token from auth-storage (Zustand persist storage)
    let token: string | null = null
    try {
      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        const { state } = JSON.parse(authStorage)
        token = state?.token || null
      }
    } catch (error) {
      console.error('Failed to parse auth storage:', error)
    }

    if (!token) {
      callbacks.onError('Not authenticated')
      return
    }

    // Use consistent API base URL (without /api since we add it below)
    const baseUrl = import.meta.env.VITE_API_BASE_URL 
      ? import.meta.env.VITE_API_BASE_URL.replace('/api', '')
      : 'http://localhost:3001'
    
    try {
      const response = await fetch(`${baseUrl}/api/qa/ask-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        let errorData: any
        try {
          errorData = await response.json()
        } catch {
          errorData = { 
            message: response.status === 404 
              ? 'Q&A endpoint not found. Please ensure backend is running.' 
              : `Request failed with status ${response.status}` 
          }
        }
        callbacks.onError(errorData.message || 'Failed to ask question')
        return
      }

      // Check if response is actually Server-Sent Events
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/event-stream')) {
        callbacks.onError('Server did not return streaming response. Expected text/event-stream.')
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        callbacks.onError('No response stream available')
        return
      }

      let buffer = ''
      let sourceSegments: any[] = []
      let qaId = ''
      let createdAt = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) {
            // Empty line signals end of event
            currentEvent = ''
            continue
          }

          if (line.startsWith('event:')) {
            // Store event type for next data line
            currentEvent = line.substring(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            const dataStr = line.substring(5).trim()
            
            // Skip empty data
            if (!dataStr) continue
            
            try {
              const data = JSON.parse(dataStr)
              
              // Handle based on event type
              if (currentEvent === 'token' && data.token !== undefined) {
                callbacks.onToken(data.token)
              } else if (currentEvent === 'complete' && data.sourceSegments) {
                sourceSegments = data.sourceSegments
              } else if (currentEvent === 'metadata') {
                qaId = data.qaId
                createdAt = data.createdAt
              } else if (currentEvent === 'error' && data.message) {
                callbacks.onError(data.message)
                return
              } else {
                // Fallback: try to infer from data content (backward compatibility)
                if (data.token !== undefined) {
                  callbacks.onToken(data.token)
                } else if (data.sourceSegments) {
                  sourceSegments = data.sourceSegments
                } else if (data.qaId) {
                  qaId = data.qaId
                  createdAt = data.createdAt
                } else if (data.message) {
                  callbacks.onError(data.message)
                  return
                }
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', dataStr, e)
            }
          }
        }
      }

      // Call completion callback with all collected data
      callbacks.onComplete({ sourceSegments, qaId, createdAt })

    } catch (error: any) {
      console.error('Streaming error:', error)
      
      // Provide more specific error messages
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        callbacks.onError('Cannot connect to server. Please check if the backend is running.')
      } else if (error.name === 'AbortError') {
        callbacks.onError('Request was cancelled')
      } else {
        callbacks.onError(error.message || 'Failed to connect to server')
      }
    }
  },

  /**
   * Generate follow-up questions based on Q&A
   */
  async getFollowUpQuestions(question: string, answer: string): Promise<string[]> {
    try {
      const response: any = await apiClient.post('/qa/follow-up', { question, answer })
      return response.data.followUpQuestions || []
    } catch (error) {
      console.error('Failed to get follow-up questions:', error)
      return []
    }
  },

  /**
   * Delete a single Q&A record
   */
  async deleteQA(qaId: string): Promise<void> {
    await apiClient.delete(`/qa/${qaId}`)
  },

  /**
   * Delete multiple Q&A records
   */
  async bulkDeleteQA(qaIds: string[]): Promise<{ deletedCount: number }> {
    const response: any = await apiClient.delete('/qa/bulk-delete', { data: { qaIds } })
    return response.data
  },
}

