import { LLMChain } from 'langchain/chains';
import { createLLM, getCurrentModelName } from '../../../config/langchain.config';
import { AITaskType } from '../../../config/ai.config';
import {
  quizGenerationPrompt,
  quizGenerationPromptBeginner,
  quizGenerationPromptIntermediate,
  quizGenerationPromptAdvanced,
} from '../prompts/quiz.prompts';
import { quizParser, parseQuizJson, validateQuiz, normalizeQuizQuestion } from '../parsers/quiz.parser';
import { logger } from '../../../config/logger';
import { ModelSelector } from '../utils/model-selector';

export interface QuizQuestionData {
  question: string;
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay';
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  sourceSegment: {
    startTime: number;
    endTime: number;
  };
  points: number;
  tags?: string[];
}

export interface QuizGenerationResult {
  questions: QuizQuestionData[];
  title?: string;
  description?: string;
  estimatedDuration?: number;
  topicsCovered?: string[];
  generationTime: number;
  model: string;
}

/**
 * Select appropriate prompt based on difficulty level
 */
const selectPromptByDifficulty = (difficulty: 'beginner' | 'intermediate' | 'advanced') => {
  switch (difficulty) {
    case 'beginner':
      return quizGenerationPromptBeginner;
    case 'intermediate':
      return quizGenerationPromptIntermediate;
    case 'advanced':
      return quizGenerationPromptAdvanced;
    default:
      return quizGenerationPrompt;
  }
};

/**
 * Calculate recommended question count based on content duration
 * Target: 5-10 questions per hour of content
 */
export const calculateQuestionCount = (durationMs: number): number => {
  const hours = durationMs / (1000 * 60 * 60);
  
  // 7 questions per hour (middle of 5-10 range)
  let questionCount = Math.ceil(hours * 7);
  
  // Enforce min/max limits
  questionCount = Math.max(5, Math.min(questionCount, 30));
  
  return questionCount;
};

/**
 * Generate quiz questions from transcript using LangChain
 */
export const generateQuiz = async (
  transcript: string,
  startTime: number,
  endTime: number,
  difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
  count?: number
): Promise<QuizGenerationResult> => {
  const startGenTime = Date.now();

  try {
    // Calculate question count if not provided
    const durationMs = endTime - startTime;
    const questionCount = count || calculateQuestionCount(durationMs);

    logger.info(`Generating ${questionCount} quiz questions at ${difficulty} level`);

    // Use Model Selector to choose appropriate model based on difficulty and transcript length
    const selectedModel = ModelSelector.selectQuizModel(difficulty, transcript.length);

    const llm = await createLLM(
      AITaskType.QUIZ_GENERATION,
      {
        temperature: 0.6, // Moderate temperature for varied but consistent questions
        maxOutputTokens: 16384, // Very high token limit to prevent truncation of quiz JSON
        modelName: selectedModel,
      }
    );

    // Select prompt based on difficulty
    const prompt = selectPromptByDifficulty(difficulty);

    const chain = new LLMChain({
      llm: llm as any, // Type assertion due to @langchain/core version mismatch
      prompt: prompt as any,
      outputParser: quizParser,
    });

    const result = await chain.call({
      transcript: transcript.substring(0, 10000), // Increased limit for better context
      count: questionCount,
      difficulty,
      format_instructions: quizParser.getFormatInstructions(),
    });

    // Parse and validate quiz with robust error handling
    let quizData: any;

    if (typeof result.text === 'string') {
      quizData = parseQuizJson(result.text);
    } else {
      quizData = result.text;
    }

    // Safety check: Ensure questions array exists and is not empty
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error('LLM response does not contain valid questions array');
    }

    // Normalize all questions: map sourceTimestamp → sourceSegment
    const normalizedQuestions = quizData.questions.map((q: any) => 
      normalizeQuizQuestion(q, startTime, endTime)
    );

    // Validate quiz structure with normalized data
    const quizForValidation = { ...quizData, questions: normalizedQuestions };
    const validation = validateQuiz(quizForValidation);
    
    if (!validation.valid) {
      logger.error('Quiz validation failed:', validation.errors);
      throw new Error(`Quiz validation failed: ${validation.errors.join(', ')}`);
    }

    // Ensure all questions have proper structure with sourceSegment
    const questions: QuizQuestionData[] = normalizedQuestions.map((q: any) => ({
      question: q.question,
      type: q.type,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty || difficulty,
      sourceSegment: {
        startTime: q.sourceSegment.startTime,
        endTime: q.sourceSegment.endTime,
      },
      points: q.points || (q.type === 'essay' ? 20 : 10),
      tags: q.tags || [],
    }));

    // Calculate estimated duration (2 minutes per question on average)
    const estimatedDuration = Math.ceil(questions.length * 2);

    const generationTime = Date.now() - startGenTime;
    
    // Log model usage for monitoring
    ModelSelector.logModelUsage(selectedModel, `quiz-${difficulty}`, generationTime);

    logger.info(
      `Generated ${questions.length} quiz questions in ${generationTime}ms using ${selectedModel}`
    );

    return {
      questions,
      title: quizData.title,
      description: quizData.description,
      estimatedDuration: quizData.estimatedDuration || estimatedDuration,
      topicsCovered: quizData.topicsCovered || [],
      generationTime,
      model: selectedModel,
    };
  } catch (error: any) {
    // Ensure error message is properly stringified
    const errorMessage = typeof error === 'string' 
      ? error 
      : error?.message || JSON.stringify(error);
    
    logger.error('Error generating quiz:', {
      error: errorMessage,
      difficulty,
      transcriptLength: transcript.length,
      startTime,
      endTime,
    });

    if (errorMessage?.includes('404') || errorMessage?.includes('not found')) {
      throw new Error(
        'AI model not available. The system will automatically retry with alternative models.'
      );
    }

    throw new Error(`Failed to generate quiz: ${errorMessage}`);
  }
};

/**
 * Generate quiz with retry logic for different difficulty levels
 */
export const generateQuizWithFallback = async (
  transcript: string,
  startTime: number,
  endTime: number,
  preferredDifficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): Promise<QuizGenerationResult> => {
  const difficultyOrder: ('beginner' | 'intermediate' | 'advanced')[] = [
    preferredDifficulty,
    'intermediate',
    'beginner',
  ];

  let lastError: Error | null = null;
  let retryCount = 0;
  const maxRetriesPerDifficulty = 2;

  for (const difficulty of difficultyOrder) {
    for (let attempt = 0; attempt < maxRetriesPerDifficulty; attempt++) {
      try {
        retryCount++;
        logger.info(`Generating quiz attempt ${retryCount} at ${difficulty} level`);
        return await generateQuiz(transcript, startTime, endTime, difficulty);
      } catch (error: any) {
        // Ensure error message is properly stringified
        const errorMsg = typeof error === 'string' 
          ? error 
          : error?.message || JSON.stringify(error);
        logger.warn(`Failed to generate quiz at ${difficulty} level (attempt ${attempt + 1}): ${errorMsg}`);
        lastError = error;
        
        // Don't retry on validation errors - these won't fix themselves
        if (errorMsg.includes('validation') && !errorMsg.includes('parse')) {
          logger.error('Quiz validation failed, skipping to next difficulty');
          break;
        }
        
        // For parsing errors, retry with same difficulty (LLM may produce better output)
        if (errorMsg.includes('parse') || errorMsg.includes('JSON')) {
          if (attempt < maxRetriesPerDifficulty - 1) {
            logger.info(`Retrying due to parsing error (attempt ${attempt + 2})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            continue;
          }
        }
        
        // For other errors, try next difficulty immediately
        break;
      }
    }
  }

  throw lastError || new Error('Failed to generate quiz with all difficulty levels and retries');
};

/**
 * Batch generate quizzes for multiple transcript segments
 */
export const batchGenerateQuizzes = async (
  segments: Array<{
    transcript: string;
    startTime: number;
    endTime: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
  }>
): Promise<QuizGenerationResult[]> => {
  const results: QuizGenerationResult[] = [];

  for (const segment of segments) {
    try {
      const quiz = await generateQuiz(
        segment.transcript,
        segment.startTime,
        segment.endTime,
        segment.difficulty || 'intermediate'
      );
      results.push(quiz);
    } catch (error: any) {
      logger.error(`Failed to generate quiz for segment:`, error);
      // Continue with other segments
    }
  }

  return results;
};
