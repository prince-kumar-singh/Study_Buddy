import { apiClient } from './api.client'

export interface Flashcard {
  _id: string
  contentId: string
  userId: string
  front: string
  back: string
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay'
  difficulty: 'easy' | 'medium' | 'hard'
  sourceSegment: {
    startTime: number
    endTime: number
  }
  spacedRepetition: {
    repetitions: number
    interval: number
    easeFactor: number
    nextReviewDate: string
  }
  statistics: {
    timesReviewed: number
    timesCorrect: number
    timesIncorrect: number
  }
  tags: string[]
  isActive: boolean
}

export const flashcardService = {
  async getFlashcards(contentId: string): Promise<{ success: boolean; data: { flashcards: Flashcard[] } }> {
    return apiClient.get(`/flashcards/${contentId}`)
  },

  async reviewFlashcard(
    id: string,
    quality: number
  ): Promise<any> {
    return apiClient.put(`/flashcards/${id}/review`, { quality })
  },

  async getDueFlashcards(): Promise<{ success: boolean; data: { flashcards: Flashcard[] } }> {
    return apiClient.get('/flashcards/due')
  },
}
