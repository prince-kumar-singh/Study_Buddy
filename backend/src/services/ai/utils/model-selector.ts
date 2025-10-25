import { logger } from '../../../config/logger';

/**
 * Gemini Model Policy (Updated October 2025 - Gemini 2.5)
 * 
 * Available models in Gemini 2.5 API:
 * - gemini-2.5-flash: Primary model, fast and balanced (PRIMARY)
 * - gemini-2.5-flash-lite: Lightweight, quick responses
 * - gemini-2.5-flash-live: Optimized for real-time streaming
 */

export const GEMINI_MODELS = {
  FLASH: 'gemini-2.5-flash',           // Primary for general tasks
  FLASH_LITE: 'gemini-2.5-flash-lite', // Lightweight for simple tasks
  FLASH_LIVE: 'gemini-2.5-flash-live', // Real-time streaming
} as const;

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

/**
 * Task complexity levels for intelligent model selection
 */
export enum TaskComplexity {
  SIMPLE = 'simple',           // Quick summaries, basic flashcards (use flash)
  MODERATE = 'moderate',        // Brief summaries, standard flashcards/quizzes (use flash)
  COMPLEX = 'complex',          // Detailed summaries, advanced quizzes, deep reasoning (use pro)
  STREAMING = 'streaming',      // Real-time Q&A, interactive responses (use flash)
}

/**
 * Model performance characteristics for selection optimization (Gemini 2.5)
 */
export const MODEL_CHARACTERISTICS = {
  [GEMINI_MODELS.FLASH]: {
    latency: 'low',               // Fast response time
    contextWindow: '1M tokens',   // Large context support
    costEfficiency: 'high',       // Cost-effective
    streamingOptimized: true,     // Supports streaming
    bestFor: ['general', 'standard-tasks', 'balanced', 'most-use-cases'],
  },
  [GEMINI_MODELS.FLASH_LITE]: {
    latency: 'ultra-low',         // Fastest response
    contextWindow: '1M tokens',   // Standard context
    costEfficiency: 'extreme',    // Cheapest option
    streamingOptimized: false,    // Not optimized for streaming
    bestFor: ['simple-tasks', 'quick-responses', 'high-load', 'low-cost'],
  },
  [GEMINI_MODELS.FLASH_LIVE]: {
    latency: 'low',               // Optimized for real-time
    contextWindow: '1M tokens',   // Large context
    costEfficiency: 'high',       // Good cost/performance
    streamingOptimized: true,     // Built for streaming
    bestFor: ['streaming', 'real-time', 'live-qa', 'interactive'],
  },
} as const;

/**
 * Configuration for model selection based on task type
 */
interface ModelSelectionConfig {
  taskType: string;
  complexity: TaskComplexity;
  isStreaming?: boolean;
  contentLength?: number;
  requiresDeepReasoning?: boolean;
}

/**
 * Intelligent model selector that routes tasks to appropriate Gemini models
 * 
 * Decision Logic (Updated for Gemini 2.5 Architecture):
 * 1. Streaming/Real-time → gemini-2.5-flash-live (optimized for streaming)
 * 2. Simple/Quick tasks → gemini-2.5-flash-lite (fast & lightweight)
 * 3. General/Standard tasks → gemini-2.5-flash (balanced & reliable)
 * 4. Fallback chain: flash-live → flash → flash-lite
 */
export class ModelSelector {
  
  /**
   * Select appropriate model based on task characteristics with intelligent routing
   */
  static selectModel(config: ModelSelectionConfig): GeminiModel {
    const {
      taskType,
      complexity,
      isStreaming = false,
      contentLength = 0,
      requiresDeepReasoning = false,
    } = config;

    // Rule 1: Streaming tasks use flash-live (optimized for real-time)
    if (isStreaming) {
      logger.info(`Model selected: ${GEMINI_MODELS.FLASH_LIVE} (streaming task: ${taskType})`);
      return GEMINI_MODELS.FLASH_LIVE;
    }

    // Rule 2: Simple tasks use flash-lite (fastest & cheapest)
    if (complexity === TaskComplexity.SIMPLE) {
      logger.info(`Model selected: ${GEMINI_MODELS.FLASH_LITE} (simple task: ${taskType})`);
      return GEMINI_MODELS.FLASH_LITE;
    }

    // Rule 3: Default to flash for general/complex tasks (balanced)
    logger.info(`Model selected: ${GEMINI_MODELS.FLASH} (default task: ${taskType})`);
    return GEMINI_MODELS.FLASH;
  }

  /**
   * Get model for summary generation based on summary type
   * Routing: Quick → flash-lite, Brief/Detailed → flash
   */
  static selectSummaryModel(summaryType: 'quick' | 'brief' | 'detailed', contentLength: number): GeminiModel {
    // Quick summaries → Use flash-lite for speed
    if (summaryType === 'quick') {
      return this.selectModel({
        taskType: `summary-${summaryType}`,
        complexity: TaskComplexity.SIMPLE,
        contentLength,
      });
    }

    // Brief and detailed summaries → Use flash for quality
    return this.selectModel({
      taskType: `summary-${summaryType}`,
      complexity: summaryType === 'detailed' ? TaskComplexity.COMPLEX : TaskComplexity.MODERATE,
      contentLength,
    });
  }

  /**
   * Get model for flashcard generation
   * Routing: Standard → flash, Large batches → flash
   */
  static selectFlashcardModel(transcriptLength: number, cardCount: number): GeminiModel {
    // All flashcard generation uses flash for quality consistency
    return this.selectModel({
      taskType: 'flashcard-generation',
      complexity: TaskComplexity.MODERATE,
      contentLength: transcriptLength,
    });
  }

  /**
   * Get model for quiz generation based on difficulty
   * Routing: Beginner → flash-lite, Intermediate/Advanced → flash
   */
  static selectQuizModel(
    difficulty: 'beginner' | 'intermediate' | 'advanced',
    transcriptLength: number
  ): GeminiModel {
    // Beginner → Use flash-lite for speed
    if (difficulty === 'beginner') {
      return this.selectModel({
        taskType: `quiz-${difficulty}`,
        complexity: TaskComplexity.SIMPLE,
        contentLength: transcriptLength,
      });
    }

    // Intermediate and advanced → Use flash for quality
    return this.selectModel({
      taskType: `quiz-${difficulty}`,
      complexity: difficulty === 'advanced' ? TaskComplexity.COMPLEX : TaskComplexity.MODERATE,
      contentLength: transcriptLength,
    });
  }

  /**
   * Get model for Q&A (optimized for streaming)
   * Routing: Streaming → flash-live, Non-streaming → flash
   */
  static selectQAModel(isStreaming: boolean = false): GeminiModel {
    // Streaming Q&A → Use flash-live (optimized for real-time)
    if (isStreaming) {
      return this.selectModel({
        taskType: 'qa-streaming',
        complexity: TaskComplexity.STREAMING,
        isStreaming: true,
      });
    }

    // Non-streaming Q&A → Use flash for consistent experience
    return this.selectModel({
      taskType: 'qa-standard',
      complexity: TaskComplexity.MODERATE,
    });
  }

  /**
   * Validate if a model name is allowed by policy
   */
  static isValidModel(modelName: string): boolean {
    const validModels = Object.values(GEMINI_MODELS);
    return validModels.includes(modelName as GeminiModel);
  }

  /**
   * Get fallback model (Flash-lite for emergency conditions)
   */
  static getFallbackModel(): GeminiModel {
    logger.warn('Using emergency fallback model: gemini-2.5-flash-lite');
    return GEMINI_MODELS.FLASH_LITE;
  }

  /**
   * Get secondary fallback model (flash as safe default)
   */
  static getSecondaryFallback(): GeminiModel {
    logger.warn('Using secondary fallback model: gemini-2.5-flash');
    return GEMINI_MODELS.FLASH;
  }

  /**
   * Log model usage statistics (for monitoring)
   */
  static logModelUsage(model: GeminiModel, taskType: string, duration: number, tokens?: number) {
    logger.info('Model usage', {
      model,
      taskType,
      durationMs: duration,
      tokens,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Smart fallback chain with load balancing
   * Returns ordered list of models to try based on task requirements
   */
  static getSmartFallbackChain(taskType: string, complexity: TaskComplexity): GeminiModel[] {
    // For streaming tasks: flash-live optimized, flash as backup, flash-lite last resort
    if (complexity === TaskComplexity.STREAMING) {
      return [
        GEMINI_MODELS.FLASH_LIVE, // Optimized for streaming
        GEMINI_MODELS.FLASH,      // Also supports streaming
        GEMINI_MODELS.FLASH_LITE, // Last resort
      ];
    }

    // For simple tasks: flash-lite primary, flash as backup
    if (complexity === TaskComplexity.SIMPLE) {
      return [
        GEMINI_MODELS.FLASH_LITE, // Fastest for simple tasks
        GEMINI_MODELS.FLASH,      // More capable fallback
        GEMINI_MODELS.FLASH_LIVE, // Alternative
      ];
    }

    // For moderate/complex tasks: flash primary, flash-live as alternative, flash-lite emergency
    return [
      GEMINI_MODELS.FLASH,      // Best balance of quality/speed
      GEMINI_MODELS.FLASH_LIVE, // Real-time capable alternative
      GEMINI_MODELS.FLASH_LITE, // Emergency fallback
    ];
  }

  /**
   * Check if error is retryable (service overload, rate limit, etc.)
   */
  static isRetryableError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('503') ||
      errorMessage.includes('overload') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('unavailable') ||
      errorMessage.includes('temporarily')
    );
  }

  /**
   * Check if error requires model fallback (404, not found, etc.)
   */
  static requiresModelFallback(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('404') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('model not available') ||
      errorMessage.includes('unsupported')
    );
  }
}

/**
 * Helper function for quick model selection without class instantiation
 */
export const selectModelForTask = (config: ModelSelectionConfig): GeminiModel => {
  return ModelSelector.selectModel(config);
};
