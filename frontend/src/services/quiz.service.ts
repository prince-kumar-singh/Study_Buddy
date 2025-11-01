import { apiClient } from './api.client';
import { Quiz, QuizAttempt, QuizSubmission, ApiResponse } from '../types';

export const quizService = {
  /**
   * Generate a new quiz for content
   */
  generateQuiz: async (
    contentId: string,
    difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
  ): Promise<Quiz> => {
    const response = await apiClient.post<ApiResponse<Quiz>>(
      `/quizzes/generate/${contentId}`,
      { difficulty }
    );
    return response.data!;
  },

  /**
   * Get quiz by ID
   */
  getQuiz: async (quizId: string): Promise<Quiz> => {
    const response = await apiClient.get<ApiResponse<Quiz>>(`/quizzes/${quizId}`);
    return response.data!;
  },

  /**
   * Get quizzes for a specific content
   */
  getQuizzesByContent: async (contentId: string, includeInactive: boolean = true): Promise<Quiz[]> => {
    const response = await apiClient.get<ApiResponse<Quiz[]>>(
      `/quizzes/content/${contentId}`,
      { params: { includeInactive } }
    );
    return response.data!;
  },

  /**
   * Get quiz version history for a specific difficulty
   */
  getQuizVersions: async (
    contentId: string,
    difficulty: 'beginner' | 'intermediate' | 'advanced'
  ): Promise<Quiz[]> => {
    const response = await apiClient.get<ApiResponse<Quiz[]>>(
      `/quizzes/content/${contentId}/versions/${difficulty}`
    );
    return response.data!;
  },

  /**
   * Start a new quiz attempt
   */
  startQuizAttempt: async (quizId: string): Promise<QuizAttempt> => {
    const response = await apiClient.post<ApiResponse<QuizAttempt>>(
      `/quizzes/${quizId}/start`
    );
    return response.data!;
  },

  /**
   * Submit quiz answers
   */
  submitQuiz: async (
    attemptId: string,
    submission: QuizSubmission
  ): Promise<{
    attempt: QuizAttempt;
    passed: boolean;
    feedback: string;
    suggestedDifficulty?: 'beginner' | 'intermediate' | 'advanced';
  }> => {
    const response = await apiClient.post<
      ApiResponse<{
        attempt: QuizAttempt;
        passed: boolean;
        feedback: string;
        suggestedDifficulty?: 'beginner' | 'intermediate' | 'advanced';
      }>
    >(`/quizzes/attempt/${attemptId}/submit`, submission);
    return response.data!;
  },

  /**
   * Get quiz attempt by ID
   */
  getQuizAttempt: async (attemptId: string): Promise<QuizAttempt> => {
    const response = await apiClient.get<ApiResponse<QuizAttempt>>(
      `/quizzes/attempt/${attemptId}`
    );
    return response.data!;
  },

  /**
   * Get user's quiz attempts
   */
  getUserQuizAttempts: async (contentId?: string): Promise<QuizAttempt[]> => {
    const params = contentId ? { contentId } : {};
    const response = await apiClient.get<ApiResponse<QuizAttempt[]>>(
      '/quizzes/attempts',
      { params }
    );
    return response.data!;
  },

  /**
   * Regenerate an existing quiz
   */
  regenerateQuiz: async (quizId: string): Promise<Quiz> => {
    const response = await apiClient.post<ApiResponse<Quiz>>(
      `/quizzes/${quizId}/regenerate`
    );
    return response.data!;
  },

  /**
   * Ensure quizzes exist for content (auto-generate if missing)
   */
  ensureQuizzesExist: async (contentId: string): Promise<{
    quizzes: Quiz[];
    existed: boolean;
    message: string;
  }> => {
    const response = await apiClient.post<ApiResponse<{
      quizzes: Quiz[];
      existed: boolean;
      message: string;
    }>>(`/quizzes/content/${contentId}/ensure`);
    return response.data!;
  },
};
