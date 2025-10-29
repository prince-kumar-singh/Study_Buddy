/**
 * LangChain Configuration Module (Refactored October 2025)
 * 
 * Integrates with centralized ai.config.ts for:
 * - Dynamic model discovery and selection
 * - Intelligent retry and fallback mechanisms
 * - Unified error handling
 * - Google Gemini v1 API support
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { logger } from './logger';
import {
  AITaskType,
  GEMINI_MODELS,
  GeminiModelName,
  getAvailableGeminiModel,
  RetryResult,
} from './ai.config';

// Re-export for backward compatibility
export const VALID_GEMINI_MODELS = GEMINI_MODELS;

// Fallback chain for Gemini 2.5 models (based on official API documentation)
const MODEL_FALLBACK_CHAIN = [
  GEMINI_MODELS.FLASH,      // Primary: gemini-2.5-flash (streaming support)
  GEMINI_MODELS.PRO,        // Advanced: gemini-2.5-pro
  GEMINI_MODELS.FLASH_LITE, // Lightweight: gemini-2.5-flash-lite
];

/**
 * LangChain configuration (integrated with ai.config.ts)
 */
export const langchainConfig = {
  llm: {
    modelName: process.env.GEMINI_MODEL_NAME || GEMINI_MODELS.FLASH,
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
    maxOutputTokens: 2048,
    topK: 40,
    topP: 0.95,
  },
  embeddings: {
    modelName: 'text-embedding-004', // Google's latest embedding model
  },
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
  },
  tracing: {
    enabled: process.env.LANGCHAIN_TRACING_V2 === 'true',
    project: process.env.LANGCHAIN_PROJECT || 'study-buddy',
  },
};

/**
 * Create LangChain LLM instance with dynamic model selection
 * Note: Uses v1 API (not v1beta) via latest @langchain/google-genai package
 */
export const createLLM = async (
  taskType: AITaskType = AITaskType.SUMMARY_BRIEF,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    topK?: number;
    topP?: number;
    modelName?: string; // Override auto-selection
  }
): Promise<ChatGoogleGenerativeAI> => {
  try {
    // Use provided model or discover best available
    const modelName = options?.modelName || await getAvailableGeminiModel(taskType);
    
    logger.info(`Creating LangChain LLM with model: ${modelName} for task: ${taskType}`);
    
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GEMINI_API_KEY,
      model: modelName, // Use 'model' instead of 'modelName' for v1 API
      temperature: options?.temperature ?? langchainConfig.llm.temperature,
      maxOutputTokens: options?.maxOutputTokens ?? langchainConfig.llm.maxOutputTokens,
      topK: options?.topK ?? langchainConfig.llm.topK,
      topP: options?.topP ?? langchainConfig.llm.topP,
      // Add safety settings to prevent blocking
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });
  } catch (error) {
    logger.error('Failed to create LLM, falling back to default:', error);
    
    // Fallback to default model - gemini-2.5-flash
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GEMINI_API_KEY,
      model: GEMINI_MODELS.FLASH, // Use stable fallback
      temperature: options?.temperature ?? langchainConfig.llm.temperature,
      maxOutputTokens: options?.maxOutputTokens ?? langchainConfig.llm.maxOutputTokens,
      // Add safety settings to fallback as well
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });
  }
};

/**
 * Execute LangChain operation with automatic retry and fallback
 * Pure LangChain implementation without native SDK dependency
 */
export const executeLangChainWithRetry = async <T>(
  taskType: AITaskType,
  operation: (llm: ChatGoogleGenerativeAI, modelName: string) => Promise<T>,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    maxAttempts?: number;
    customFallbacks?: GeminiModelName[];
  }
): Promise<RetryResult<T>> => {
  const startTime = Date.now();
  const maxAttempts = options?.maxAttempts || 3;
  
  // Get fallback chain from task preferences or use custom
  let fallbackChain: GeminiModelName[];
  if (options?.customFallbacks) {
    fallbackChain = options.customFallbacks;
  } else {
    // Use ai.config task preferences with Gemini 2.5 models
    const { getAvailableGeminiModel } = await import('./ai.config');
    const primaryModel = await getAvailableGeminiModel(taskType);
    fallbackChain = [
      primaryModel, 
      GEMINI_MODELS.FLASH,      // Primary fallback (streaming support)
      GEMINI_MODELS.PRO,        // Advanced fallback
      GEMINI_MODELS.FLASH_LITE  // Emergency fallback
    ].filter((m, i, arr) => arr.indexOf(m) === i); // Remove duplicates
  }
  
  let lastError: Error | null = null;
  let currentModelIndex = 0;
  let totalAttempts = 0;
  const fallbacksUsed: string[] = [];
  
  // Helper function to check if error is retryable
  const isRetryableError = (error: any): boolean => {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('503') ||
      errorMessage.includes('overload') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('try again') ||
      errorMessage.includes('cannot read properties of undefined') || // LangChain parsing error
      errorMessage.includes('candidates') || // Gemini API empty response
      errorMessage.includes('blocked') // Content filtering
    );
  };
  
  // Helper function to calculate backoff delay
  const calculateBackoffDelay = (attempt: number): number => {
    const baseDelay = 2000; // 2 seconds
    const maxDelay = 30000; // 30 seconds
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
  };
  
  // Try each model in the fallback chain
  while (currentModelIndex < fallbackChain.length) {
    const currentModelName = fallbackChain[currentModelIndex];
    fallbacksUsed.push(currentModelName);
    
    logger.info(`[LangChain] Attempting with model: ${currentModelName} (fallback level ${currentModelIndex + 1}/${fallbackChain.length})`);
    
    // Retry with current model
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      totalAttempts++;
      
      try {
        // Add delay for retries
        if (attempt > 0) {
          const delay = calculateBackoffDelay(attempt - 1);
          logger.info(`[LangChain] Retry ${attempt}/${maxAttempts - 1} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Create LangChain LLM instance
        const llm = new ChatGoogleGenerativeAI({
          apiKey: process.env.GOOGLE_GEMINI_API_KEY,
          modelName: currentModelName,
          temperature: options?.temperature ?? langchainConfig.llm.temperature,
          maxOutputTokens: options?.maxOutputTokens ?? langchainConfig.llm.maxOutputTokens,
          topK: langchainConfig.llm.topK,
          topP: langchainConfig.llm.topP,
        });
        
        // Execute operation with LangChain LLM
        const result = await operation(llm, currentModelName);
        
        const totalDurationMs = Date.now() - startTime;
        logger.info(`[LangChain] ✓ Operation successful with ${currentModelName} after ${totalAttempts} attempts (${totalDurationMs}ms)`);
        
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
        
        logger.warn(`[LangChain] Attempt ${totalAttempts} failed with ${currentModelName}: ${errorMessage}`);
        
        // Check if error is retryable
        if (!isRetryableError(error) || attempt === maxAttempts - 1) {
          // Non-retryable error or max retries reached for this model
          if (attempt === maxAttempts - 1) {
            logger.error(`[LangChain] Max retries (${maxAttempts}) reached for model ${currentModelName}, trying next fallback`);
            break; // Move to next model
          } else {
            logger.error(`[LangChain] Non-retryable error, trying next fallback: ${errorMessage}`);
            break; // Move to next model for non-retryable errors too
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
    `[LangChain] All models exhausted after ${totalAttempts} attempts (${totalDurationMs}ms). ` +
    `Models tried: ${fallbacksUsed.join(' → ')}. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Safely execute a LangChain chain with error handling for empty Gemini responses
 * Wraps chain.call() to catch and provide better error messages
 */
export const safeChainCall = async <T = any>(
  chain: any,
  inputs: any,
  context?: { taskType?: string; modelName?: string }
): Promise<T> => {
  try {
    const result = await chain.call(inputs);
    
    // Check if result is valid
    if (!result) {
      throw new Error(
        `Chain returned null/undefined result. This may indicate the Gemini API blocked the response due to safety filters. ` +
        `Task: ${context?.taskType || 'unknown'}, Model: ${context?.modelName || 'unknown'}`
      );
    }
    
    // Handle array results (some chains return [result])
    const actualResult = Array.isArray(result) ? result[0] : result;
    
    if (!actualResult) {
      throw new Error(
        `Chain returned empty array result. This may indicate the Gemini API blocked the response. ` +
        `Task: ${context?.taskType || 'unknown'}, Model: ${context?.modelName || 'unknown'}`
      );
    }
    
    return actualResult as T;
  } catch (error: any) {
    // Enhance error messages for common issues
    if (error.message?.includes('Cannot read properties of undefined')) {
      throw new Error(
        `Gemini API returned an empty response (no candidates). This typically happens when: ` +
        `1) Content was blocked by safety filters, 2) API returned malformed response, or 3) Model is temporarily unavailable. ` +
        `Original error: ${error.message}. ` +
        `Task: ${context?.taskType || 'unknown'}, Model: ${context?.modelName || 'unknown'}`
      );
    }
    
    // Re-throw with additional context
    throw new Error(
      `Chain execution failed: ${error.message}. ` +
      `Task: ${context?.taskType || 'unknown'}, Model: ${context?.modelName || 'unknown'}`
    );
  }
};

/**
 * Create embeddings with dynamic model discovery
 */
export const createEmbeddings = async (): Promise<GoogleGenerativeAIEmbeddings> => {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY is required for embeddings');
  }
  
  try {
    logger.info('Creating GoogleGenerativeAI embeddings');
    
    return new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GEMINI_API_KEY,
      modelName: langchainConfig.embeddings.modelName,
    });
  } catch (error) {
    logger.error('Failed to create embeddings:', error);
    throw error;
  }
};

/**
 * Get current model name (for backward compatibility)
 */
export const getCurrentModelName = (): string => {
  return langchainConfig.llm.modelName;
};

// ============================================================================
// DEPRECATED FUNCTIONS (Kept for backward compatibility)
// These will be removed in future versions
// ============================================================================

/**
 * @deprecated Use createLLM() with AITaskType instead
 */
export const createLLMWithFallback = async (
  options?: Partial<typeof langchainConfig.llm>,
  customFallbackChain?: string[]
): Promise<ChatGoogleGenerativeAI> => {
  logger.warn('createLLMWithFallback is deprecated, use createLLM() instead');
  return createLLM(AITaskType.SUMMARY_BRIEF, options);
};

/**
 * @deprecated Use createLLM() which includes built-in retry logic
 */
export const createLLMWithRetry = async (
  options?: Partial<typeof langchainConfig.llm>,
  maxRetries: number = 3
): Promise<ChatGoogleGenerativeAI> => {
  logger.warn('createLLMWithRetry is deprecated, use createLLM() instead');
  return createLLM(AITaskType.SUMMARY_BRIEF, options);
};

/**
 * @deprecated Use executeLangChainWithRetry() instead
 */
export const executeWithSmartFallback = async <T>(
  operation: (llm: ChatGoogleGenerativeAI) => Promise<T>,
  options?: {
    modelName?: string;
    temperature?: number;
    maxOutputTokens?: number;
    fallbackChain?: string[];
    maxRetriesPerModel?: number;
  }
): Promise<{ result: T; modelUsed: string; attemptsMade: number }> => {
  logger.warn('executeWithSmartFallback is deprecated, use executeLangChainWithRetry() instead');
  
  const result = await executeLangChainWithRetry(
    AITaskType.SUMMARY_BRIEF,
    async (llm, modelName) => {
      return operation(llm);
    },
    options
  );
  
  return {
    result: result.result,
    modelUsed: result.modelUsed,
    attemptsMade: result.attemptsMade,
  };
};

