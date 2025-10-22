import { LLMChain } from 'langchain/chains';
import { createLLM } from '../../../config/langchain.config';
import { flashcardGenerationPrompt } from '../prompts/summary.prompts';
import { flashcardParser } from '../parsers/flashcard.parser';
import { logger } from '../../../config/logger';

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
    const llm = createLLM({
      temperature: 0.7, // Higher temperature for more varied flashcards
      maxOutputTokens: 2048,
    });

    const chain = new LLMChain({
      llm,
      prompt: flashcardGenerationPrompt,
      outputParser: flashcardParser,
    });

    const result = await chain.call({
      transcript: transcript.substring(0, 6000), // Limit transcript length
      count,
      format_instructions: flashcardParser.getFormatInstructions(),
    });

    // Parse and validate flashcards
    let flashcards: FlashcardData[] = [];
    
    if (Array.isArray(result.text)) {
      flashcards = result.text;
    } else if (typeof result.text === 'string') {
      try {
        const parsed = JSON.parse(result.text);
        flashcards = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        logger.error('Failed to parse flashcard JSON');
      }
    }

    // Ensure all flashcards have source timestamps
    flashcards = flashcards.map((card) => ({
      ...card,
      sourceTimestamp: card.sourceTimestamp || { startTime, endTime },
    }));

    const generationTime = Date.now() - startGenTime;

    logger.info(`Generated ${flashcards.length} flashcards in ${generationTime}ms`);

    return {
      flashcards,
      generationTime,
      model: 'gemini-pro',
    };
  } catch (error) {
    logger.error('Error generating flashcards:', error);
    throw new Error('Failed to generate flashcards');
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

    return {
      flashcards: finalFlashcards,
      generationTime: Date.now() - startTime,
      model: 'gemini-pro',
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
