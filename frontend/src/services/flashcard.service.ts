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

export interface FlashcardStatistics {
  total: number
  dueToday: number
  mastered: number
  learning: number
  averageAccuracy: number
}

export const flashcardService = {
  async getFlashcards(contentId: string): Promise<{ success: boolean; data: { flashcards: Flashcard[]; count: number } }> {
    return apiClient.get(`/flashcards/${contentId}`)
  },

  async reviewFlashcard(
    id: string,
    quality: number,
    responseTime?: number
  ): Promise<{ success: boolean; message: string; data: { flashcard: Flashcard; nextReview: string; interval: number } }> {
    return apiClient.put(`/flashcards/${id}/review`, { quality, responseTime })
  },

  async getDueFlashcards(): Promise<{ success: boolean; data: { flashcards: Flashcard[]; count: number } }> {
    return apiClient.get('/flashcards/due')
  },

  async getStatistics(): Promise<{ success: boolean; data: FlashcardStatistics }> {
    return apiClient.get('/flashcards/statistics')
  },

  async resetFlashcard(id: string): Promise<{ success: boolean; message: string; data: { flashcard: Flashcard } }> {
    return apiClient.put(`/flashcards/${id}/reset`, {})
  },

  async createCustomFlashcard(data: {
    contentId: string;
    front: string;
    back: string;
    type: 'mcq' | 'truefalse' | 'fillin' | 'essay';
    difficulty: 'easy' | 'medium' | 'hard';
    tags?: string[];
  }): Promise<{ success: boolean; message: string; data: { flashcard: Flashcard } }> {
    return apiClient.post('/flashcards/create', data)
  },

  async updateFlashcard(
    id: string,
    updates: {
      front?: string;
      back?: string;
      type?: 'mcq' | 'truefalse' | 'fillin' | 'essay';
      difficulty?: 'easy' | 'medium' | 'hard';
      tags?: string[];
    }
  ): Promise<{ success: boolean; message: string; data: { flashcard: Flashcard } }> {
    return apiClient.put(`/flashcards/${id}`, updates)
  },
}
