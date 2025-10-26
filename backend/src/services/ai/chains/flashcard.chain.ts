import { LLMChain } from 'langchain/chains';
import { createLLM, getCurrentModelName, safeChainCall } from '../../../config/langchain.config';
import { AITaskType } from '../../../config/ai.config';
import { flashcardGenerationPrompt } from '../prompts/summary.prompts';
import { flashcardParser, parseFlashcardJson } from '../parsers/flashcard.parser';
import { logger } from '../../../config/logger';
import { ModelSelector } from '../utils/model-selector';
import {
  isQuotaError,
  parseQuotaError,
  QuotaExceededError,
  logQuotaError,
} from '../../../utils/quota-error-handler';

export interface FlashcardData {
  front: string;
  back: string;
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay';
  difficulty: 'easy' | 'medium' | 'hard';
  sourceTimestamp: {
    startTime: number;
    endTime: number;
  };
  tags?: string[];
}

export interface FlashcardGenerationResult {
  flashcards: FlashcardData[];
  generationTime: number;
  model: string;
}

/**
 * Generate flashcards from transcript segment using LangChain
 */
export const generateFlashcards = async (
  transcript: string,
  startTime: number,
  endTime: number,
  count: number = 10
): Promise<FlashcardGenerationResult> => {
  const startGenTime = Date.now();

  try {
    // Use Model Selector to choose appropriate model based on transcript length and card count
    const selectedModel = ModelSelector.selectFlashcardModel(transcript.length, count);
    
    const llm = await createLLM(
      AITaskType.FLASHCARD_GENERATION,
      {
        temperature: 0.7, // Higher temperature for more varied flashcards
        maxOutputTokens: 4096, // High token limit to prevent truncation
        modelName: selectedModel,
      }
    );

    const chain = new LLMChain({
      llm: llm as any, // Type assertion due to @langchain/core version mismatch
      prompt: flashcardGenerationPrompt as any,
      outputParser: flashcardParser,
    });

    const result = await safeChainCall(chain, {
      transcript: transcript.substring(0, 6000), // Limit transcript length
      count,
      format_instructions: flashcardParser.getFormatInstructions(),
    }, {
      taskType: 'flashcard_generation',
      modelName: selectedModel,
    });

    // Parse and validate flashcards with robust JSON parsing
    let flashcards: FlashcardData[] = [];
    
    if (Array.isArray(result.text)) {
      flashcards = result.text;
    } else if (typeof result.text === 'string') {
      try {
        // Use robust parser that handles truncated JSON
        flashcards = parseFlashcardJson(result.text);
      } catch (parseError: any) {
        logger.error('Failed to parse flashcard JSON:', {
          error: parseError.message,
          textPreview: result.text.substring(0, 500)
        });
        throw parseError;
      }
    } else {
      // Handle unexpected result format
      logger.warn('Unexpected result format from LLM:', typeof result.text);
      throw new Error('LLM returned unexpected result format');
    }

    // Ensure all flashcards have source timestamps
    flashcards = flashcards.map((card) => ({
      ...card,
      sourceTimestamp: card.sourceTimestamp || { startTime, endTime },
    }));

    const generationTime = Date.now() - startGenTime;

    // Log model usage for monitoring
    ModelSelector.logModelUsage(selectedModel, 'flashcard-generation', generationTime);

    logger.info(`Generated ${flashcards.length} flashcards in ${generationTime}ms using ${selectedModel}`);

    return {
      flashcards,
      generationTime,
      model: selectedModel,
    };
  } catch (error: any) {
    // Check if this is a quota error
    if (isQuotaError(error)) {
      const quotaInfo = parseQuotaError(error);
      logQuotaError('generateFlashcards', quotaInfo);
      
      // Throw specialized quota error for upstream handling
      throw new QuotaExceededError(quotaInfo);
    }
    
    logger.error('Error generating flashcards:', {
      error: error.message,
      startTime,
      endTime,
      count,
    });
    
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      throw new Error(
        'AI model not available. The system will automatically retry with alternative models.'
      );
    }
    
    throw new Error(`Failed to generate flashcards: ${error.message}`);
  }
};

/**
 * Generate flashcards for entire content by processing segments
 */
export const generateContentFlashcards = async (
  segments: Array<{ text: string; startTime: number; endTime: number }>,
  targetCount: number = 30
): Promise<FlashcardGenerationResult> => {
  const startTime = Date.now();
  const allFlashcards: FlashcardData[] = [];

  try {
    // Calculate flashcards per segment
    const cardsPerSegment = Math.ceil(targetCount / segments.length);

    // Generate flashcards for each segment
    for (const segment of segments) {
      try {
        const result = await generateFlashcards(
          segment.text,
          segment.startTime,
          segment.endTime,
          cardsPerSegment
        );
        allFlashcards.push(...result.flashcards);
      } catch (error) {
        logger.error(`Failed to generate flashcards for segment ${segment.startTime}:`, error);
      }
    }

    // Limit to target count
    const finalFlashcards = allFlashcards.slice(0, targetCount);
    
    // Use the first segment's model for reporting (all use same selector logic)
    const selectedModel = ModelSelector.selectFlashcardModel(
      segments[0]?.text.length || 0,
      cardsPerSegment
    );

    return {
      flashcards: finalFlashcards,
      generationTime: Date.now() - startTime,
      model: selectedModel,
    };
  } catch (error) {
    logger.error('Error generating content flashcards:', error);
    throw error;
  }
};

/**
 * Calculate SM-2 spaced repetition values
 */
export const calculateSpacedRepetition = (
  quality: number, // 0-5 rating
  repetitions: number,
  interval: number,
  easeFactor: number
): {
  repetitions: number;
  interval: number;
  easeFactor: number;
  nextReviewDate: Date;
} => {
  let newRepetitions = repetitions;
  let newInterval = interval;
  let newEaseFactor = easeFactor;

  if (quality >= 3) {
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    newRepetitions = repetitions + 1;
  } else {
    newRepetitions = 0;
    newInterval = 1;
  }

  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEaseFactor = Math.max(1.3, newEaseFactor);

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReviewDate,
  };
};
