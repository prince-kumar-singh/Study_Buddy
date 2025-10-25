import { LLMChain } from 'langchain/chains';
import { createLLM } from '../../../config/langchain.config';
import { AITaskType, GEMINI_MODELS } from '../../../config/ai.config';
import {
  quickSummaryPrompt,
  briefSummaryPrompt,
  detailedSummaryPrompt,
  conceptExtractionPrompt,
} from '../prompts/summary.prompts';
import { conceptParser } from '../parsers/flashcard.parser';
import { logger } from '../../../config/logger';
import {
  isQuotaError,
  parseQuotaError,
  QuotaExceededError,
  logQuotaError,
  getQuotaFallbackModel,
} from '../../../utils/quota-error-handler';
import { quotaService } from '../../quota.service';

export type SummaryType = 'quick' | 'brief' | 'detailed';

export interface SummaryResult {
  content: string;
  wordCount: number;
  generationTime: number;
  model: string;
  concepts?: {
    topics: string[];
    concepts: string[];
    terms: Array<{ term: string; definition: string }>;
  };
}

/**
 * Generate a summary from content using LangChain
 */
export const generateSummary = async (
  content: string,
  type: SummaryType = 'brief',
  userId?: string,
  contentId?: string
): Promise<SummaryResult> => {
  const startTime = Date.now();

  try {
    // Select appropriate prompt based on type
    let prompt;
    let taskType: AITaskType;
    switch (type) {
      case 'quick':
        prompt = quickSummaryPrompt;
        taskType = AITaskType.SUMMARY_QUICK;
        break;
      case 'detailed':
        prompt = detailedSummaryPrompt;
        taskType = AITaskType.SUMMARY_DETAILED;
        break;
      default:
        prompt = briefSummaryPrompt;
        taskType = AITaskType.SUMMARY_BRIEF;
    }

    // Create LLM with appropriate temperature
    const llm = await createLLM(taskType, {
      temperature: 0.3, // Lower temperature for more focused summaries
    });

    // Create chain
    const chain = new LLMChain({
      llm: llm as any, // Type assertion due to @langchain/core version mismatch
      prompt: prompt as any,
    });

    // Generate summary
    const result = await chain.call({
      content: content.substring(0, 8000), // Limit content length
    });

    const summaryContent = result.text.trim();
    const wordCount = summaryContent.split(/\s+/).length;
    const generationTime = Date.now() - startTime;

    logger.info(`Generated ${type} summary: ${wordCount} words in ${generationTime}ms`);

    // Log successful API request
    if (userId) {
      await quotaService.logApiRequest({
        userId: userId as any,
        contentId: contentId as any,
        apiProvider: 'gemini',
        endpoint: 'generateContent',
        requestType: 'summarization',
        status: 'success',
        requestDuration: generationTime,
        metadata: {
          model: GEMINI_MODELS.FLASH,
          summaryType: type,
          wordCount
        }
      }).catch(err => logger.error('Failed to log API request:', err));
    }

    // Extract concepts for detailed summaries
    let concepts;
    if (type === 'detailed') {
      try {
        concepts = await extractConcepts(content, userId, contentId);
      } catch (error) {
        logger.error('Failed to extract concepts:', error);
      }
    }

    return {
      content: summaryContent,
      wordCount,
      generationTime,
      model: GEMINI_MODELS.FLASH,
      concepts,
    };
  } catch (error) {
    const generationTime = Date.now() - startTime;

    // Log failed API request
    if (userId) {
      await quotaService.logApiRequest({
        userId: userId as any,
        contentId: contentId as any,
        apiProvider: 'gemini',
        endpoint: 'generateContent',
        requestType: 'summarization',
        status: isQuotaError(error) ? 'quota_exceeded' : 'failure',
        requestDuration: generationTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorCode: isQuotaError(error) ? '429' : '500',
        metadata: {
          model: GEMINI_MODELS.FLASH,
          summaryType: type
        }
      }).catch(err => logger.error('Failed to log API request:', err));
    }

    // Check if this is a quota error
    if (isQuotaError(error)) {
      const quotaInfo = parseQuotaError(error);
      logQuotaError('generateSummary', quotaInfo);
      
      // Throw specialized quota error for upstream handling
      throw new QuotaExceededError(quotaInfo);
    }

    logger.error('Error generating summary:', error);
    throw new Error('Failed to generate summary');
  }
};

/**
 * Extract key concepts from content
 */
export const extractConcepts = async (
  content: string,
  userId?: string,
  contentId?: string
): Promise<{
  topics: string[];
  concepts: string[];
  terms: Array<{ term: string; definition: string }>;
}> => {
  const startTime = Date.now();

  try {
    const llm = await createLLM(AITaskType.CONCEPT_EXTRACTION, { 
      temperature: 0.3,
      maxOutputTokens: 2048, // Sufficient for concept extraction
    });

    const chain = new LLMChain({
      llm: llm as any, // Type assertion due to @langchain/core version mismatch
      prompt: conceptExtractionPrompt as any,
      outputParser: conceptParser,
    });

    const result = await chain.call({
      content: content.substring(0, 10000),
    });

    const generationTime = Date.now() - startTime;

    // Log successful API request
    if (userId) {
      await quotaService.logApiRequest({
        userId: userId as any,
        contentId: contentId as any,
        apiProvider: 'gemini',
        endpoint: 'generateContent',
        requestType: 'other',
        status: 'success',
        requestDuration: generationTime,
        metadata: {
          model: GEMINI_MODELS.FLASH,
          taskType: 'concept_extraction'
        }
      }).catch(err => logger.error('Failed to log API request:', err));
    }

    return result.text;
  } catch (error) {
    const generationTime = Date.now() - startTime;

    // Check if this is a parsing error from truncated JSON
    if (error instanceof Error && error.message.includes('Failed to parse')) {
      logger.error('Error extracting concepts:', error);
      
      // Return minimal fallback structure instead of failing completely
      logger.warn('Using fallback concept extraction due to parsing error');
      return {
        topics: [],
        concepts: [],
        terms: [],
      };
    }

    // Log failed API request
    if (userId) {
      await quotaService.logApiRequest({
        userId: userId as any,
        contentId: contentId as any,
        apiProvider: 'gemini',
        endpoint: 'generateContent',
        requestType: 'other',
        status: isQuotaError(error) ? 'quota_exceeded' : 'failure',
        requestDuration: generationTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorCode: isQuotaError(error) ? '429' : '500',
        metadata: {
          model: GEMINI_MODELS.FLASH,
          taskType: 'concept_extraction'
        }
      }).catch(err => logger.error('Failed to log API request:', err));
    }

    logger.error('Error extracting concepts:', error);
    throw error;
  }
};

/**
 * Generate summary for long documents using map-reduce strategy
 */
export const generateLongDocumentSummary = async (
  chunks: string[],
  type: SummaryType = 'brief'
): Promise<SummaryResult> => {
  const startTime = Date.now();

  try {
    // Generate summaries for each chunk
    const chunkSummaries = await Promise.all(
      chunks.map((chunk) => generateSummary(chunk, 'quick'))
    );

    // Combine chunk summaries
    const combinedContent = chunkSummaries.map((s) => s.content).join('\n\n');

    // Generate final summary from combined content
    const finalSummary = await generateSummary(combinedContent, type);

    return {
      ...finalSummary,
      generationTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Error generating long document summary:', error);
    throw error;
  }
};
