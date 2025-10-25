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
    quotaInfo?: QuotaInfo
    [key: string]: any
  }
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface ProcessingStage {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  progress: number
  startedAt?: string
  completedAt?: string
  error?: string
  errorType?: string
  errorDetails?: {
    quotaInfo?: QuotaInfo
    pausedAt?: string
    message?: string
    [key: string]: any
  }
}

export interface QuotaInfo {
  isQuotaError: boolean
  quotaMetric?: string
  quotaLimit?: number
  retryAfterSeconds?: number
  estimatedRecoveryTime?: string
  suggestedAction: string
  errorMessage: string
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
  description?: string
  questions: QuizQuestion[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  totalPoints: number
  passingScore: number
  timeLimit?: number
  metadata: {
    generationTime: number
    model: string
    topicsCovered?: string[]
    estimatedDuration?: number
  }
  statistics: {
    totalAttempts: number
    averageScore: number
    averageTimeSpent: number
    completionRate: number
  }
  // Version tracking for regeneration
  version: number
  generationMethod: 'auto' | 'manual' | 'regenerated'
  generationAttempts: number
  previousVersionId?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface QuizQuestion {
  question: string
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay'
  options?: string[]
  correctAnswer?: string | string[]
  explanation?: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  sourceSegment: {
    startTime: number
    endTime: number
  }
  points: number
  tags?: string[]
}

export interface QuizAttempt {
  _id: string
  quizId: string
  contentId: string
  userId: string
  answers: QuizAnswer[]
  score: number
  totalPoints: number
  percentage: number
  timeSpent: number
  startedAt: string
  completedAt?: string
  status: 'in-progress' | 'completed' | 'abandoned'
  performance: {
    correctAnswers: number
    incorrectAnswers: number
    skippedAnswers: number
    averageTimePerQuestion: number
    strongTopics: string[]
    weakTopics: string[]
  }
  feedback?: {
    overallFeedback: string
    suggestedResources?: string[]
    nextDifficultyLevel?: 'beginner' | 'intermediate' | 'advanced'
  }
  createdAt: string
  updatedAt: string
}

export interface QuizAnswer {
  questionIndex: number
  userAnswer: string | string[]
  isCorrect: boolean
  pointsEarned: number
  timeSpent: number
  timestamp: string
}

export interface QuizSubmission {
  answers: Array<{
    questionIndex: number
    userAnswer: string | string[]
    timeSpent: number
  }>
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    message: string
    code?: string
  }
}
