import { logger } from '../../../config/logger';
import { GEMINI_MODELS, GeminiModel } from './model-selector';

/**
 * Model Performance Analytics and Monitoring System
 * 
 * Tracks usage, latency, costs, and success rates for the 3-model architecture
 */

interface ModelUsageMetrics {
  model: GeminiModel;
  taskType: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  tokensUsed?: number;
  success: boolean;
  errorType?: string;
  retries: number;
  fallbackUsed: boolean;
}

interface ModelStatistics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  totalCostUSD: number;
  successRate: number;
  avgRetries: number;
  fallbackRate: number;
}

interface CostConfig {
  [key: string]: {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
  };
}

/**
 * Cost estimates for Gemini 2.5 models (October 2025)
 * Updated prices for Gemini 2.5 API (Official Google Pricing)
 */
const MODEL_COSTS: CostConfig = {
  [GEMINI_MODELS.FLASH]: {
    inputCostPerMillion: 0.075,   // gemini-2.5-flash pricing (streaming support)
    outputCostPerMillion: 0.30,
  },
  [GEMINI_MODELS.FLASH_LITE]: {
    inputCostPerMillion: 0.0375,  // gemini-2.5-flash-lite pricing (cheapest)
    outputCostPerMillion: 0.15,
  },
  [GEMINI_MODELS.PRO]: {
    inputCostPerMillion: 0.15,    // gemini-2.5-pro pricing (advanced reasoning)
    outputCostPerMillion: 0.60,
  },
};

class ModelAnalytics {
  private metrics: ModelUsageMetrics[] = [];
  private metricsRetentionMs = 24 * 60 * 60 * 1000; // Keep 24 hours of metrics

  /**
   * Start tracking a model operation
   */
  startTracking(model: GeminiModel, taskType: string): string {
    const trackingId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const metric: ModelUsageMetrics = {
      model,
      taskType,
      startTime: Date.now(),
      success: false,
      retries: 0,
      fallbackUsed: false,
    };
    
    this.metrics.push(metric);
    
    logger.debug(`Started tracking: ${trackingId} - ${model} - ${taskType}`);
    return trackingId;
  }

  /**
   * Complete tracking for a successful operation
   */
  recordSuccess(
    model: GeminiModel,
    taskType: string,
    durationMs: number,
    tokensUsed?: number,
    retries: number = 0,
    fallbackUsed: boolean = false
  ): void {
    const metric: ModelUsageMetrics = {
      model,
      taskType,
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      durationMs,
      tokensUsed,
      success: true,
      retries,
      fallbackUsed,
    };
    
    this.metrics.push(metric);
    this.cleanupOldMetrics();
    
    // Log high-level metrics
    logger.info('Model operation completed', {
      model,
      taskType,
      durationMs,
      tokensUsed,
      retries,
      fallbackUsed,
    });
  }

  /**
   * Record a failed operation
   */
  recordFailure(
    model: GeminiModel,
    taskType: string,
    durationMs: number,
    errorType: string,
    retries: number = 0
  ): void {
    const metric: ModelUsageMetrics = {
      model,
      taskType,
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      durationMs,
      success: false,
      errorType,
      retries,
      fallbackUsed: retries > 0,
    };
    
    this.metrics.push(metric);
    this.cleanupOldMetrics();
    
    logger.warn('Model operation failed', {
      model,
      taskType,
      durationMs,
      errorType,
      retries,
    });
  }

  /**
   * Get statistics for a specific model
   */
  getModelStats(model: GeminiModel, timeWindowMs?: number): ModelStatistics {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const modelMetrics = this.metrics.filter(
      m => m.model === model && m.startTime > cutoff && m.endTime
    );

    if (modelMetrics.length === 0) {
      return this.emptyStats();
    }

    const successful = modelMetrics.filter(m => m.success);
    const failed = modelMetrics.filter(m => !m.success);
    const durations = modelMetrics.map(m => m.durationMs || 0).filter(d => d > 0);
    const tokens = modelMetrics.map(m => m.tokensUsed || 0);
    const retries = modelMetrics.map(m => m.retries);
    const fallbacks = modelMetrics.filter(m => m.fallbackUsed);

    const totalTokens = tokens.reduce((sum, t) => sum + t, 0);
    const estimatedCost = this.calculateCost(model, totalTokens);

    return {
      totalCalls: modelMetrics.length,
      successfulCalls: successful.length,
      failedCalls: failed.length,
      totalTokens,
      avgLatencyMs: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minLatencyMs: Math.min(...durations),
      maxLatencyMs: Math.max(...durations),
      totalCostUSD: estimatedCost,
      successRate: (successful.length / modelMetrics.length) * 100,
      avgRetries: retries.reduce((sum, r) => sum + r, 0) / modelMetrics.length,
      fallbackRate: (fallbacks.length / modelMetrics.length) * 100,
    };
  }

  /**
   * Get comprehensive stats for all models
   */
  getAllStats(timeWindowMs?: number): Record<GeminiModel, ModelStatistics> {
    return {
      [GEMINI_MODELS.FLASH]: this.getModelStats(GEMINI_MODELS.FLASH, timeWindowMs),
      [GEMINI_MODELS.FLASH_LITE]: this.getModelStats(GEMINI_MODELS.FLASH_LITE, timeWindowMs),
      [GEMINI_MODELS.PRO]: this.getModelStats(GEMINI_MODELS.PRO, timeWindowMs),
    };
  }

  /**
   * Get statistics by task type
   */
  getTaskTypeStats(taskType: string, timeWindowMs?: number): Record<GeminiModel, ModelStatistics> {
    const originalMetrics = [...this.metrics];
    
    // Temporarily filter to task type
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    this.metrics = this.metrics.filter(
      m => m.taskType === taskType && m.startTime > cutoff
    );
    
    const stats = this.getAllStats();
    
    // Restore original metrics
    this.metrics = originalMetrics;
    
    return stats;
  }

  /**
   * Calculate estimated cost based on tokens
   * Assumes 50/50 split between input and output tokens
   */
  private calculateCost(model: GeminiModel, totalTokens: number): number {
    const costs = MODEL_COSTS[model];
    if (!costs || totalTokens === 0) return 0;

    const inputTokens = totalTokens * 0.5;
    const outputTokens = totalTokens * 0.5;

    const inputCost = (inputTokens / 1_000_000) * costs.inputCostPerMillion;
    const outputCost = (outputTokens / 1_000_000) * costs.outputCostPerMillion;

    return inputCost + outputCost;
  }

  /**
   * Get cost comparison across models
   */
  getCostComparison(timeWindowMs?: number): Record<GeminiModel, number> {
    const stats = this.getAllStats(timeWindowMs);
    return {
      [GEMINI_MODELS.FLASH]: stats[GEMINI_MODELS.FLASH].totalCostUSD,
      [GEMINI_MODELS.FLASH_LITE]: stats[GEMINI_MODELS.FLASH_LITE].totalCostUSD,
      [GEMINI_MODELS.PRO]: stats[GEMINI_MODELS.PRO].totalCostUSD,
    };
  }

  /**
   * Get latency percentiles for a model
   */
  getLatencyPercentiles(model: GeminiModel, timeWindowMs?: number): {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const durations = this.metrics
      .filter(m => m.model === model && m.startTime > cutoff && m.durationMs)
      .map(m => m.durationMs!)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    }

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * durations.length) - 1;
      return durations[Math.max(0, index)];
    };

    return {
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
    };
  }

  /**
   * Generate performance report
   */
  generateReport(timeWindowMs: number = 60 * 60 * 1000): string {
    const stats = this.getAllStats(timeWindowMs);
    const costs = this.getCostComparison(timeWindowMs);
    const timeWindowHours = timeWindowMs / (60 * 60 * 1000);

    let report = `\n========== Model Performance Report (Last ${timeWindowHours}h) ==========\n\n`;

    for (const model of Object.values(GEMINI_MODELS)) {
      const modelStats = stats[model];
      const latency = this.getLatencyPercentiles(model, timeWindowMs);

      report += `${model}:\n`;
      report += `  Total Calls: ${modelStats.totalCalls}\n`;
      report += `  Success Rate: ${modelStats.successRate.toFixed(2)}%\n`;
      report += `  Avg Latency: ${modelStats.avgLatencyMs.toFixed(0)}ms\n`;
      report += `  P50/P95/P99: ${latency.p50}ms / ${latency.p95}ms / ${latency.p99}ms\n`;
      report += `  Total Tokens: ${modelStats.totalTokens.toLocaleString()}\n`;
      report += `  Estimated Cost: $${modelStats.totalCostUSD.toFixed(4)}\n`;
      report += `  Avg Retries: ${modelStats.avgRetries.toFixed(2)}\n`;
      report += `  Fallback Rate: ${modelStats.fallbackRate.toFixed(2)}%\n\n`;
    }

    const totalCost = Object.values(costs).reduce((sum, c) => sum + c, 0);
    report += `Total Estimated Cost: $${totalCost.toFixed(4)}\n`;
    report += `=====================================================\n`;

    return report;
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(timeWindowMs?: number): ModelUsageMetrics[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    return this.metrics.filter(m => m.startTime > cutoff);
  }

  /**
   * Clear old metrics to prevent memory bloat
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionMs;
    this.metrics = this.metrics.filter(m => m.startTime > cutoff);
  }

  /**
   * Empty stats object
   */
  private emptyStats(): ModelStatistics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      totalCostUSD: 0,
      successRate: 0,
      avgRetries: 0,
      fallbackRate: 0,
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics = [];
    logger.info('Model analytics reset');
  }
}

// Singleton instance
export const modelAnalytics = new ModelAnalytics();

/**
 * Decorator for automatic performance tracking
 */
export function trackModelPerformance(taskType: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let model: GeminiModel = GEMINI_MODELS.FLASH; // Default
      let success = false;

      try {
        const result = await originalMethod.apply(this, args);
        success = true;
        model = result?.model || GEMINI_MODELS.FLASH; // Use result model or fallback
        
        const durationMs = Date.now() - startTime;
        modelAnalytics.recordSuccess(model, taskType, durationMs, result?.tokensUsed);
        
        return result;
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        modelAnalytics.recordFailure(model, taskType, durationMs, err.message);
        
        throw err;
      }
    };

    return descriptor;
  };
}
