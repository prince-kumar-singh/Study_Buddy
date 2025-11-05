/**
 * Centralized AI Configuration Module
 * 
 * Manages Google Gemini API integration with:
 * - Dynamic model discovery and selection
 * - Intelligent retry mechanisms with exponential backoff
 * - Model fallback chains for resilience
 * - Unified error handling and logging
 * - v1 API endpoints (not v1beta)
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { logger } from './logger';

// ============================================================================
// Constants and Types
// ============================================================================

/**
 * Task types for intelligent model selection
 */
export enum AITaskType {
  SUMMARY_QUICK = 'summary_quick',
  SUMMARY_BRIEF = 'summary_brief',
  SUMMARY_DETAILED = 'summary_detailed',
  FLASHCARD_GENERATION = 'flashcard_generation',
  QUIZ_GENERATION = 'quiz_generation',
  QA_SIMPLE = 'qa_simple',
  QA_COMPLEX = 'qa_complex',
  QA_STREAMING = 'qa_streaming',
  EMBEDDING = 'embedding',
  CONCEPT_EXTRACTION = 'concept_extraction',
  CONTENT_QUALITY = 'content_quality',
  ENTITY_EXTRACTION = 'entity_extraction',
  DIFFICULTY_ANALYSIS = 'difficulty_analysis',
  SEMANTIC_METADATA = 'semantic_metadata',
}

/**
 * Current Gemini models (October 2025 - Updated to Gemini 2.5)
 * Using Gemini 2.5 series based on official Google AI API documentation
 * 
 * Available Models (Official):
 * - gemini-2.5-flash: Primary model for most tasks (fast, balanced, STREAMING SUPPORT)
 * - gemini-2.5-flash-lite: Lightweight model for simple/quick tasks
 * - gemini-2.5-pro: Advanced model for complex reasoning
 * 
 * NOTE: "gemini-2.5-flash-live" does NOT exist in the official API.
 * Use gemini-2.5-flash for streaming - it has native streaming capabilities.
 */
export const GEMINI_MODELS = {
  FLASH: 'gemini-2.5-flash',           // Primary: General purpose, balanced, streaming
  FLASH_LITE: 'gemini-2.5-flash-lite', // Lightweight: Simple/quick tasks
  PRO: 'gemini-2.5-pro',               // Advanced: Complex reasoning
  // Legacy aliases for backward compatibility
  FLASH_8B: 'gemini-2.5-flash-lite',   // Alias to FLASH_LITE
  FLASH_LATEST: 'gemini-2.5-flash',    // Alias to FLASH
  PRO_LATEST: 'gemini-2.5-pro',        // Alias to PRO
} as const;

export type GeminiModelName = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

/**
 * AI Configuration Interface
 */
export interface AIConfig {
  apiKey: string;
  models: {
    preferred: GeminiModelName;
    fallbacks: GeminiModelName[];
  };
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  modelDiscovery: {
    enabled: boolean;
    cacheDurationMs: number;
  };
}

/**
 * Model metadata from discovery
 */
export interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature: number;
  topP: number;
  topK: number;
}

/**
 * Retry result interface
 */
export interface RetryResult<T> {
  result: T;
  modelUsed: string;
  attemptsMade: number;
  totalDurationMs: number;
  fallbacksUsed: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default AI configuration
 */
export const defaultAIConfig: AIConfig = {
  apiKey: process.env.GOOGLE_GEMINI_API_KEY || '',
  models: {
    preferred: GEMINI_MODELS.FLASH,
    fallbacks: [
      GEMINI_MODELS.FLASH,      // Primary: gemini-2.5-flash (streaming support)
      GEMINI_MODELS.PRO,        // Advanced: gemini-2.5-pro
      GEMINI_MODELS.FLASH_LITE, // Lightweight: gemini-2.5-flash-lite
    ],
  },
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  cache: {
    enabled: process.env.ENABLE_AI_CACHE === 'true',
    ttlSeconds: 3600,
  },
  modelDiscovery: {
    enabled: true,
    cacheDurationMs: 3600000, // 1 hour
  },
};

/**
 * Task-to-model mapping for intelligent selection (Gemini 2.5 models)
 * NOTE: gemini-2.5-flash has native streaming support, so use it for QA_STREAMING
 */
const TASK_MODEL_PREFERENCES: Record<AITaskType, { primary: GeminiModelName; fallbacks: GeminiModelName[] }> = {
  [AITaskType.SUMMARY_QUICK]: {
    primary: GEMINI_MODELS.FLASH_LITE,
    fallbacks: [GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.FLASH, GEMINI_MODELS.PRO],
  },
  [AITaskType.SUMMARY_BRIEF]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.SUMMARY_DETAILED]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.PRO, GEMINI_MODELS.FLASH_LITE],
  },
  [AITaskType.FLASHCARD_GENERATION]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.QUIZ_GENERATION]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.QA_SIMPLE]: {
    primary: GEMINI_MODELS.FLASH_LITE,
    fallbacks: [GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.FLASH, GEMINI_MODELS.PRO],
  },
  [AITaskType.QA_COMPLEX]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.PRO, GEMINI_MODELS.FLASH_LITE],
  },
  [AITaskType.QA_STREAMING]: {
    primary: GEMINI_MODELS.FLASH, // FLASH has native streaming support
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.PRO, GEMINI_MODELS.FLASH_LITE],
  },
  [AITaskType.EMBEDDING]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE],
  },
  [AITaskType.CONCEPT_EXTRACTION]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.CONTENT_QUALITY]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.ENTITY_EXTRACTION]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.DIFFICULTY_ANALYSIS]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
  [AITaskType.SEMANTIC_METADATA]: {
    primary: GEMINI_MODELS.FLASH,
    fallbacks: [GEMINI_MODELS.FLASH, GEMINI_MODELS.FLASH_LITE, GEMINI_MODELS.PRO],
  },
};

// ============================================================================
// Model Discovery and Selection
// ============================================================================

/**
 * Model cache for dynamic discovery
 */
let modelCache: {
  models: ModelInfo[];
  timestamp: number;
} | null = null;

/**
 * Initialize Google Generative AI client
 */
export const initializeGenAI = (): GoogleGenerativeAI => {
  const apiKey = defaultAIConfig.apiKey;
  
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is required');
  }
  
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Discover available Gemini models dynamically
 * Caches results to minimize API calls
 */
export const discoverAvailableModels = async (forceRefresh: boolean = false): Promise<ModelInfo[]> => {
  const now = Date.now();
  
  // Return cached models if available and not expired
  if (
    !forceRefresh &&
    modelCache &&
    now - modelCache.timestamp < defaultAIConfig.modelDiscovery.cacheDurationMs
  ) {
    logger.debug('Returning cached model list');
    return modelCache.models;
  }
  
  try {
    logger.info('Discovering available Gemini models via ListModels API...');
    const genAI = initializeGenAI();
    
    // Use the actual listModels() API to get available models
    const availableModels: ModelInfo[] = [];
    
    try {
      // Fetch list of all available models from Google AI
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${defaultAIConfig.apiKey}`
      );
      
      if (!response.ok) {
        throw new Error(`ListModels API failed: ${response.status} ${response.statusText}`);
      }
      
      const data: any = await response.json();
      const models = data.models || [];
      
      logger.info(`Found ${models.length} total models from API`);
      
      // Filter for Gemini models that support generateContent
      for (const modelInfo of models) {
        const modelName = modelInfo.name.replace('models/', ''); // Remove 'models/' prefix
        
        // Only include Gemini models that support content generation
        if (
          modelName.includes('gemini') &&
          modelInfo.supportedGenerationMethods?.includes('generateContent')
        ) {
          availableModels.push({
            name: modelName,
            displayName: modelInfo.displayName || modelName,
            description: modelInfo.description || `Gemini model: ${modelName}`,
            inputTokenLimit: modelInfo.inputTokenLimit || 30000,
            outputTokenLimit: modelInfo.outputTokenLimit || 2048,
            supportedGenerationMethods: modelInfo.supportedGenerationMethods || ['generateContent'],
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
          });
          
          logger.info(`✓ Model available: ${modelName}`);
        }
      }
    } catch (fetchError: any) {
      logger.warn(`Failed to use ListModels API, falling back to test approach: ${fetchError.message}`);
      
      // Fallback: Test known models manually
      const modelsToTest = Object.values(GEMINI_MODELS);
      
      for (const modelName of modelsToTest) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          
          // Test model with a minimal request
          await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          });
          
          availableModels.push({
            name: modelName,
            displayName: modelName,
            description: `Gemini model: ${modelName}`,
            inputTokenLimit: modelName.includes('pro') ? 2000000 : 1000000,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
          });
          
          logger.info(`✓ Model available: ${modelName}`);
        } catch (error: any) {
          logger.warn(`✗ Model unavailable: ${modelName} - ${error.message}`);
        }
      }
    }
    
    if (availableModels.length === 0) {
      throw new Error('No Gemini models are currently available. Please check your API key and ensure the Gemini API is enabled.');
    }
    
    // Cache the results
    modelCache = {
      models: availableModels,
      timestamp: now,
    };
    
    logger.info(`Model discovery complete: ${availableModels.length} models available`);
    return availableModels;
  } catch (error) {
    logger.error('Failed to discover models:', error);
    
    // If discovery fails, return a default fallback list
    if (modelCache) {
      logger.warn('Using cached model list due to discovery failure');
      return modelCache.models;
    }
    
    throw error;
  }
};

/**
 * Get the best available model for a specific task
 */
export const getAvailableGeminiModel = async (
  taskType: AITaskType,
  forceRefresh: boolean = false
): Promise<GeminiModelName> => {
  try {
    const availableModels = await discoverAvailableModels(forceRefresh);
    const availableModelNames = availableModels.map(m => m.name);
    
    // Get task preferences
    const preferences = TASK_MODEL_PREFERENCES[taskType];
    
    // Try primary model first
    if (availableModelNames.includes(preferences.primary)) {
      logger.info(`Selected primary model for ${taskType}: ${preferences.primary}`);
      return preferences.primary;
    }
    
    // Try fallback models
    for (const fallback of preferences.fallbacks) {
      if (availableModelNames.includes(fallback)) {
        logger.info(`Selected fallback model for ${taskType}: ${fallback}`);
        return fallback;
      }
    }
    
    // If no preferred models available, use first available
    const firstAvailable = availableModelNames[0] as GeminiModelName;
    logger.warn(`No preferred models available for ${taskType}, using: ${firstAvailable}`);
    return firstAvailable;
  } catch (error) {
    logger.error(`Failed to get model for task ${taskType}, using default:`, error);
    return GEMINI_MODELS.FLASH;
  }
};

/**
 * Get a Generative Model instance with the best available model
 */
export const getGenerativeModel = async (
  taskType: AITaskType,
  config?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  }
): Promise<GenerativeModel> => {
  const modelName = await getAvailableGeminiModel(taskType);
  const genAI = initializeGenAI();
  
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: config?.temperature ?? 0.7,
      topK: config?.topK ?? 40,
      topP: config?.topP ?? 0.95,
      maxOutputTokens: config?.maxOutputTokens ?? 2048,
    },
  });
};

// ============================================================================
// Retry and Error Handling
// ============================================================================

/**
 * Check if error is retryable
 */
const isRetryableError = (error: any): boolean => {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  return (
    errorMessage.includes('503') ||
    errorMessage.includes('overload') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('temporarily unavailable') ||
    errorMessage.includes('try again')
  );
};

/**
 * Check if error requires model fallback
 */
const requiresModelFallback = (error: any): boolean => {
  const errorMessage = error?.message?.toLowerCase() || '';
  
  return (
    errorMessage.includes('404') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('not available') ||
    errorMessage.includes('model') && errorMessage.includes('does not exist')
  );
};

/**
 * Calculate exponential backoff delay
 */
const calculateBackoffDelay = (attempt: number): number => {
  const delay = defaultAIConfig.retry.initialDelayMs * Math.pow(defaultAIConfig.retry.backoffMultiplier, attempt);
  return Math.min(delay, defaultAIConfig.retry.maxDelayMs);
};

/**
 * Execute an AI operation with intelligent retry and fallback
 */
export const withRetries = async <T>(
  operation: (model: GenerativeModel, modelName: string) => Promise<T>,
  taskType: AITaskType,
  options?: {
    maxAttempts?: number;
    customFallbacks?: GeminiModelName[];
  }
): Promise<RetryResult<T>> => {
  const startTime = Date.now();
  const maxAttempts = options?.maxAttempts || defaultAIConfig.retry.maxAttempts;
  const fallbackChain = options?.customFallbacks || TASK_MODEL_PREFERENCES[taskType].fallbacks;
  
  let lastError: Error | null = null;
  let currentModelIndex = 0;
  let totalAttempts = 0;
  const fallbacksUsed: string[] = [];
  
  // Try each model in the fallback chain
  while (currentModelIndex < fallbackChain.length) {
    const currentModelName = fallbackChain[currentModelIndex];
    fallbacksUsed.push(currentModelName);
    
    logger.info(`Attempting with model: ${currentModelName} (fallback level ${currentModelIndex + 1}/${fallbackChain.length})`);
    
    // Retry with current model
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      totalAttempts++;
      
      try {
        // Add delay for retries
        if (attempt > 0) {
          const delay = calculateBackoffDelay(attempt - 1);
          logger.info(`Retry ${attempt}/${maxAttempts - 1} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Get model instance
        const genAI = initializeGenAI();
        const model = genAI.getGenerativeModel({ model: currentModelName });
        
        // Execute operation
        const result = await operation(model, currentModelName);
        
        const totalDurationMs = Date.now() - startTime;
        logger.info(`✓ Operation successful with ${currentModelName} after ${totalAttempts} attempts (${totalDurationMs}ms)`);
        
        return {
          result,
          modelUsed: currentModelName,
          attemptsMade: totalAttempts,
          totalDurationMs,
          fallbacksUsed,
        };
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || 'Unknown error';
        
        logger.warn(`Attempt ${totalAttempts} failed with ${currentModelName}: ${errorMessage}`);
        
        // Check if we should fallback to next model
        if (requiresModelFallback(error)) {
          logger.warn(`Model ${currentModelName} not available, trying next fallback`);
          break; // Move to next model
        }
        
        // Check if error is retryable
        if (!isRetryableError(error) || attempt === maxAttempts - 1) {
          // Non-retryable error or max retries reached for this model
          if (attempt === maxAttempts - 1) {
            logger.error(`Max retries (${maxAttempts}) reached for model ${currentModelName}`);
            break; // Move to next model
          } else {
            throw error; // Non-retryable error, propagate immediately
          }
        }
      }
    }
    
    // Move to next fallback model
    currentModelIndex++;
  }
  
  // All models and retries exhausted
  const totalDurationMs = Date.now() - startTime;
  throw new Error(
    `All models exhausted after ${totalAttempts} attempts (${totalDurationMs}ms). ` +
    `Models tried: ${fallbacksUsed.join(' → ')}. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Execute operation with single model and retries only
 */
export const withRetriesOnly = async <T>(
  operation: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    initialDelay?: number;
  }
): Promise<T> => {
  const maxAttempts = options?.maxAttempts || defaultAIConfig.retry.maxAttempts;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        logger.info(`Retry ${attempt}/${maxAttempts - 1} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryableError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      
      logger.warn(`Attempt ${attempt + 1} failed, retrying: ${error.message}`);
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
};

// ============================================================================
// Exports
// ============================================================================

export {
  initializeGenAI as default,
  GoogleGenerativeAI,
  GenerativeModel,
};
