export interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin'
  subscription: {
    tier: 'free' | 'premium' | 'institutional'
    startDate?: string
    endDate?: string
  }
  preferences: {
    language: string
    timezone: string
    notifications: boolean
    pomodoroInterval: number
  }
}

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

export interface ProcessingStage {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  startedAt?: string
  completedAt?: string
  error?: string
}

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
    lastReviewDate?: string
  }
  statistics: {
    timesReviewed: number
    timesCorrect: number
    timesIncorrect: number
    averageResponseTime?: number
  }
  tags: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface QA {
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
  relatedFlashcards?: string[]
  feedback?: {
    helpful: boolean
    comment?: string
  }
  metadata: {
    responseTime: number
    model: string
    confidence?: number
  }
  createdAt: string
  updatedAt: string
}

export interface Summary {
  _id: string
  contentId: string
  type: 'quick' | 'brief' | 'detailed'
  content: string
  keyPoints: string[]
  topics: string[]
  metadata: {
    wordCount: number
    generationTime: number
    model: string
  }
  createdAt: string
  updatedAt: string
}

export interface Quiz {
  _id: string
  contentId: string
  userId: string
  title: string
  questions: QuizQuestion[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  timeLimit?: number
  passingScore: number
  createdAt: string
  updatedAt: string
}

export interface QuizQuestion {
  question: string
  type: 'mcq' | 'truefalse' | 'short_answer'
  options?: string[]
  correctAnswer: string
  explanation: string
  points: number
  sourceTimestamp?: {
    startTime: number
    endTime: number
  }
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    message: string
    code?: string
  }
}
