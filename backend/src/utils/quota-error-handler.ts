/**
 * Quota Error Handler Utility
 * 
 * Handles Google Gemini API quota errors (429 Too Many Requests) with:
 * - Quota-specific error detection
 * - Retry-after delay extraction
 * - User-friendly error messages
 * - Graceful degradation strategies
 */

import { logger } from '../config/logger';

export interface QuotaErrorInfo {
  isQuotaError: boolean;
  retryAfterSeconds?: number;
  quotaMetric?: string;
  quotaLimit?: number;
  errorMessage: string;
  suggestedAction: string;
  estimatedRecoveryTime?: Date;
}

/**
 * Check if an error is a quota/rate limit error
 */
export const isQuotaError = (error: any): boolean => {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorString = String(error).toLowerCase();
  
  return (
    errorMessage.includes('429') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorString.includes('quota exceeded') ||
    errorString.includes('quotafailure')
  );
};

/**
 * Extract detailed quota error information from Gemini API error
 */
export const parseQuotaError = (error: any): QuotaErrorInfo => {
  const errorMessage = error?.message || String(error);
  
  // Default quota error info
  const info: QuotaErrorInfo = {
    isQuotaError: isQuotaError(error),
    errorMessage: errorMessage,
    suggestedAction: 'Please try again later or upgrade your API plan',
  };

  if (!info.isQuotaError) {
    return info;
  }

  // Extract retry-after delay from error message
  // Format: "Please retry in 13.221599157s"
  const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
  if (retryMatch) {
    const retrySeconds = parseFloat(retryMatch[1]);
    info.retryAfterSeconds = Math.ceil(retrySeconds);
    info.estimatedRecoveryTime = new Date(Date.now() + retrySeconds * 1000);
  }

  // Extract quota metric from error details
  // Format: "generativelanguage.googleapis.com/generate_content_free_tier_requests"
  const metricMatch = errorMessage.match(/quotaMetric[\":\s]+([^\"]+)/i);
  if (metricMatch) {
    info.quotaMetric = metricMatch[1];
  }

  // Extract quota limit from error
  // Format: "quotaValue\":\"50"
  const limitMatch = errorMessage.match(/quotaValue[\":\s]+(\d+)/i);
  if (limitMatch) {
    info.quotaLimit = parseInt(limitMatch[1]);
  }

  // Determine quota type and provide user-friendly message
  if (errorMessage.includes('free_tier') || errorMessage.includes('FreeTier')) {
    info.suggestedAction = `Free tier quota limit reached (${info.quotaLimit || 50} requests/day). Consider:
1. Waiting until tomorrow (quota resets at midnight PT)
2. Using gemini-2.5-flash-lite model (lower quota usage)
3. Upgrading to paid tier at https://ai.google.dev/pricing`;
  } else if (errorMessage.includes('per_minute') || errorMessage.includes('PerMinute')) {
    info.suggestedAction = `Rate limit exceeded. Please wait ${info.retryAfterSeconds || 60} seconds before retrying.`;
  } else if (errorMessage.includes('per_day') || errorMessage.includes('PerDay')) {
    info.suggestedAction = `Daily quota exceeded. Quota resets at midnight Pacific Time. Consider upgrading your API plan.`;
  }

  return info;
};

/**
 * Calculate smart backoff delay for quota errors
 * Returns longer delays for quota errors vs regular errors
 */
export const calculateQuotaBackoffDelay = (
  attemptNumber: number,
  quotaInfo?: QuotaErrorInfo
): number => {
  // If we have a specific retry-after time from API, use it
  if (quotaInfo?.retryAfterSeconds) {
    return quotaInfo.retryAfterSeconds * 1000;
  }

  // For quota errors without specific retry time, use longer backoff
  if (quotaInfo?.isQuotaError) {
    // Start with 5 minutes for first quota error, then exponential backoff
    const baseDelay = 5 * 60 * 1000; // 5 minutes
    const maxDelay = 60 * 60 * 1000; // 1 hour
    const delay = baseDelay * Math.pow(2, attemptNumber);
    return Math.min(delay, maxDelay);
  }

  // Regular exponential backoff for non-quota errors
  const baseDelay = 2000; // 2 seconds
  const maxDelay = 30000; // 30 seconds
  const delay = baseDelay * Math.pow(2, attemptNumber);
  return Math.min(delay, maxDelay);
};

/**
 * Format quota error for user display
 */
export const formatQuotaErrorMessage = (quotaInfo: QuotaErrorInfo): string => {
  if (!quotaInfo.isQuotaError) {
    return 'An error occurred during processing';
  }

  let message = '🚫 **API Quota Limit Reached**\n\n';

  if (quotaInfo.quotaLimit) {
    message += `You've reached the daily limit of ${quotaInfo.quotaLimit} AI requests.\n`;
  } else {
    message += 'API quota limit has been exceeded.\n';
  }

  if (quotaInfo.estimatedRecoveryTime) {
    const recoveryDate = quotaInfo.estimatedRecoveryTime.toLocaleString();
    message += `\n⏰ Estimated recovery: ${recoveryDate}\n`;
  }

  message += `\n💡 ${quotaInfo.suggestedAction}`;

  return message;
};

/**
 * Log quota error with detailed context
 */
export const logQuotaError = (
  operation: string,
  quotaInfo: QuotaErrorInfo,
  contentId?: string
): void => {
  logger.error(`Quota error in ${operation}`, {
    contentId,
    quotaMetric: quotaInfo.quotaMetric,
    quotaLimit: quotaInfo.quotaLimit,
    retryAfterSeconds: quotaInfo.retryAfterSeconds,
    estimatedRecoveryTime: quotaInfo.estimatedRecoveryTime,
    suggestedAction: quotaInfo.suggestedAction,
  });
};

/**
 * Determine if we should retry after a quota error
 * Returns false if quota error is persistent (daily limit) vs temporary (rate limit)
 */
export const shouldRetryQuotaError = (quotaInfo: QuotaErrorInfo): boolean => {
  // Don't retry if daily quota is exhausted
  if (quotaInfo.quotaMetric?.includes('per_day') || quotaInfo.quotaMetric?.includes('PerDay')) {
    return false;
  }

  // Don't retry free tier daily limits
  if (quotaInfo.quotaMetric?.includes('free_tier') && quotaInfo.quotaLimit) {
    return false;
  }

  // Retry per-minute rate limits after waiting
  if (quotaInfo.quotaMetric?.includes('per_minute') || quotaInfo.quotaMetric?.includes('PerMinute')) {
    return true;
  }

  // By default, don't retry quota errors (requires manual intervention)
  return false;
};

/**
 * Get alternative model suggestion for quota scenarios
 */
export const getQuotaFallbackModel = (currentModel: string): string | null => {
  // If using pro model, suggest flash for lower quota usage
  if (currentModel.includes('pro')) {
    return 'gemini-2.5-flash';
  }

  // If using flash, suggest flash-lite
  if (currentModel.includes('flash') && !currentModel.includes('lite')) {
    return 'gemini-2.5-flash-lite';
  }

  // No further fallback available
  return null;
};

/**
 * Create a quota-aware error object
 */
export class QuotaExceededError extends Error {
  public readonly quotaInfo: QuotaErrorInfo;
  public readonly isPermanent: boolean;

  constructor(quotaInfo: QuotaErrorInfo) {
    super(formatQuotaErrorMessage(quotaInfo));
    this.name = 'QuotaExceededError';
    this.quotaInfo = quotaInfo;
    this.isPermanent = !shouldRetryQuotaError(quotaInfo);
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, QuotaExceededError);
  }
}
