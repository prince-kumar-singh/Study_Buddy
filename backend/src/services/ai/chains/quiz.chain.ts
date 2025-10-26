import { LLMChain } from 'langchain/chains';
import { createLLM, getCurrentModelName, safeChainCall } from '../../../config/langchain.config';
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
    let questionCount = count || calculateQuestionCount(durationMs);

    // Apply safety cap based on difficulty to prevent truncation
    // Advanced questions are longer, so we need to limit them more
    const maxQuestionsByDifficulty = {
      beginner: 30,
      intermediate: 20,
      advanced: 12, // Reduced from 30 to prevent truncation
    };
    
    questionCount = Math.min(questionCount, maxQuestionsByDifficulty[difficulty]);

    logger.info(`Generating ${questionCount} quiz questions at ${difficulty} level (capped at ${maxQuestionsByDifficulty[difficulty]})`);

    // Use Model Selector to choose appropriate model based on difficulty and transcript length
    const selectedModel = ModelSelector.selectQuizModel(difficulty, transcript.length);

    // Calculate dynamic token limit based on question count and difficulty
    // Advanced questions need more tokens (avg ~400 tokens per question)
    // Intermediate: ~250 tokens, Beginner: ~150 tokens
    const tokensPerQuestion = difficulty === 'advanced' ? 500 : difficulty === 'intermediate' ? 300 : 200;
    const estimatedTokens = Math.min(
      questionCount * tokensPerQuestion + 1000, // +1000 for metadata
      30000 // Cap at 30k to avoid hitting model limits
    );

    logger.info(`Using ${estimatedTokens} max tokens for ${questionCount} ${difficulty} questions`);

    const llm = await createLLM(
      AITaskType.QUIZ_GENERATION,
      {
        temperature: 0.6, // Moderate temperature for varied but consistent questions
        maxOutputTokens: estimatedTokens,
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

    const result = await safeChainCall(chain, {
      transcript: transcript.substring(0, 10000), // Increased limit for better context
      count: questionCount,
      difficulty,
      format_instructions: quizParser.getFormatInstructions(),
    }, {
      taskType: `quiz_generation_${difficulty}`,
      modelName: selectedModel,
    });

    // Parse and validate quiz with robust error handling
    let quizData: any;

    // Debug logging to understand the result structure
    logger.debug('LLMChain result structure:', {
      resultType: typeof result,
      isArray: Array.isArray(result),
      keys: result ? Object.keys(result) : 'null',
      hasText: result && 'text' in result,
      textType: result?.text ? typeof result.text : 'undefined'
    });

    // Safety check: Ensure result exists and has text
    if (!result) {
      throw new Error('LLM chain returned null or undefined result');
    }

    // Handle array result (some chain versions return [result])
    const actualResult = Array.isArray(result) ? result[0] : result;
    
    if (!actualResult) {
      throw new Error('LLM chain returned empty array result');
    }

    if (!actualResult.text && !actualResult.output) {
      logger.error('LLM chain result missing text/output property:', { 
        actualResult, 
        keys: Object.keys(actualResult) 
      });
      throw new Error('LLM chain returned result without text or output property');
    }

    // Get text from result (try multiple possible properties)
    const textContent = actualResult.text || actualResult.output || actualResult.response;
    
    if (!textContent) {
      throw new Error('Could not extract text content from LLM result');
    }

    if (typeof textContent === 'string') {
      quizData = parseQuizJson(textContent);
    } else if (typeof textContent === 'object') {
      quizData = textContent;
    } else {
      throw new Error(`Unexpected text content type: ${typeof textContent}`);
    }

    // Check if response was truncated (parser may have recovered partial questions)
    const wasTruncated = quizData._warning?.includes('Truncated');
    if (wasTruncated) {
      logger.warn(`Quiz generation was truncated: ${quizData._warning}`);
    }

    // Safety check: Ensure questions array exists and is not empty
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      throw new Error('LLM response does not contain valid questions array');
    }

    // If we got fewer questions than requested due to truncation, log it but continue
    const recoveredCount = quizData.questions.length;
    if (recoveredCount < questionCount) {
      logger.warn(
        `Recovered ${recoveredCount}/${questionCount} questions from ${difficulty} quiz ` +
        `(${Math.round((recoveredCount / questionCount) * 100)}% success rate)`
      );
      
      // If we got less than 50% of requested questions, consider it a failure
      if (recoveredCount < Math.ceil(questionCount / 2)) {
        throw new Error(
          `Only recovered ${recoveredCount}/${questionCount} questions from truncated response. ` +
          `This is below the minimum threshold. Try reducing question count.`
        );
      }
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
