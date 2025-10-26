import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';
import { logger } from '../../../config/logger';

/**
 * Zod schema for quiz question validation
 * Note: Accepts both sourceTimestamp (LLM output) and sourceSegment (DB schema)
 */
export const quizQuestionSchema = z.object({
  question: z.string().min(10).max(500).describe('The quiz question text'),
  type: z.enum(['mcq', 'truefalse', 'fillin', 'essay']).describe('Question type'),
  options: z
    .array(z.string())
    .optional()
    .describe('Answer options for MCQ, should have 3-5 options'),
  correctAnswer: z
    .union([z.string(), z.array(z.string())])
    .describe('Correct answer(s) - string for single, array for multiple'),
  explanation: z
    .string()
    .optional()
    .describe('Explanation of why this is the correct answer'),
  difficulty: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .describe('Question difficulty level'),
  // Accept either sourceTimestamp (from LLM) or sourceSegment (DB format)
  sourceTimestamp: z
    .object({
      startTime: z.number().min(0).describe('Start time in milliseconds'),
      endTime: z.number().min(0).describe('End time in milliseconds'),
    })
    .optional()
    .describe('Timestamp segment from source material'),
  sourceSegment: z
    .object({
      startTime: z.number().min(0).describe('Start time in milliseconds'),
      endTime: z.number().min(0).describe('End time in milliseconds'),
    })
    .optional()
    .describe('Timestamp segment from source material'),
  points: z
    .number()
    .min(5)
    .max(50)
    .default(10)
    .describe('Points for this question (5-50)'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorizing the question'),
});

/**
 * Zod schema for complete quiz
 */
export const quizSchema = z.object({
  questions: z
    .array(quizQuestionSchema)
    .min(1)
    .max(50)
    .describe('Array of quiz questions'),
  title: z.string().optional().describe('Quiz title'),
  description: z.string().optional().describe('Quiz description'),
  estimatedDuration: z
    .number()
    .optional()
    .describe('Estimated time to complete in minutes'),
  topicsCovered: z
    .array(z.string())
    .optional()
    .describe('Main topics covered in the quiz'),
});

/**
 * Structured output parser for quiz generation
 */
export const quizParser = StructuredOutputParser.fromZodSchema(quizSchema);

/**
 * Structured output parser for individual question generation
 */
export const quizQuestionParser = StructuredOutputParser.fromZodSchema(
  z.array(quizQuestionSchema)
);

/**
 * Validate quiz question data
 */
export const validateQuizQuestion = (question: any): boolean => {
  try {
    // Get sourceSegment (normalized) or sourceTimestamp (legacy)
    const segment = question.sourceSegment || question.sourceTimestamp;
    
    if (!segment || typeof segment.startTime !== 'number' || typeof segment.endTime !== 'number') {
      return false;
    }
    
    // Create normalized version for validation
    const normalized = {
      ...question,
      sourceTimestamp: segment,
      sourceSegment: segment,
    };
    
    quizQuestionSchema.parse(normalized);
    
    // Additional validation rules
    if (question.type === 'mcq' && (!question.options || question.options.length < 2)) {
      return false;
    }
    
    if (question.type === 'truefalse' && question.options && question.options.length !== 2) {
      return false;
    }
    
    if (segment.endTime <= segment.startTime) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate complete quiz data
 */
export const validateQuiz = (quiz: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    quizSchema.parse(quiz);
    
    // Check each question
    quiz.questions.forEach((q: any, index: number) => {
      if (!validateQuizQuestion(q)) {
        errors.push(`Question ${index + 1} failed validation`);
      }
    });
    
    // Check for duplicate questions
    const questions = quiz.questions.map((q: any) => q.question.toLowerCase().trim());
    const uniqueQuestions = new Set(questions);
    if (questions.length !== uniqueQuestions.size) {
      errors.push('Quiz contains duplicate questions');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: [error.message || 'Quiz validation failed'],
    };
  }
};

/**
 * Parse quiz JSON with robust error handling
 * Handles markdown fences, truncated JSON, and malformed responses
 */
export const parseQuizJson = (jsonString: string): any => {
  try {
    // Step 1: Clean markdown fences and extra whitespace
    let cleaned = jsonString.trim();
    
    // Remove markdown code fences (```json or ``` at start/end)
    // Handle multiple variations: ```json, ```JSON, ``` with json, etc.
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```\s*$/i, '');
    cleaned = cleaned.trim();
    
    // Step 2: Try to parse the cleaned JSON
    let parsed: any;
    
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError: any) {
      // Step 3: Handle truncated/incomplete JSON
      console.warn('JSON parsing failed, attempting recovery:', parseError.message);
      
      // Try to fix truncated JSON by adding missing closing characters
      let truncated = cleaned;
      
      // Count opening and closing braces/brackets
      const openBraces = (cleaned.match(/{/g) || []).length;
      const closeBraces = (cleaned.match(/}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/]/g) || []).length;
      
      // Check if we're in the middle of a string value by counting quotes
      // Only count unescaped quotes
      let quoteCount = 0;
      let escapeNext = false;
      for (let i = 0; i < truncated.length; i++) {
        const char = truncated[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          quoteCount++;
        }
      }
      
      // If odd number of quotes, we have an unterminated string
      if (quoteCount % 2 !== 0) {
        truncated += '"';
      }
      
      // Add missing closing brackets first (for arrays)
      if (closeBrackets < openBrackets) {
        truncated += ']'.repeat(openBrackets - closeBrackets);
      }
      
      // Then add missing braces (for objects)
      if (closeBraces < openBraces) {
        truncated += '}'.repeat(openBraces - closeBraces);
      }
      
      try {
        parsed = JSON.parse(truncated);
      } catch (truncateError) {
        // Last resort: extract only complete questions from the array
        logger.warn('Attempting to extract complete questions from truncated JSON...');
        
        const questionsMatch = cleaned.match(/"questions":\s*\[(.*)/s);
        if (questionsMatch) {
          const questionsText = questionsMatch[1];
          const questions: any[] = [];
          let currentObj = '';
          let braceDepth = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < questionsText.length; i++) {
            const char = questionsText[i];
            
            if (escapeNext) {
              currentObj += char;
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              currentObj += char;
              continue;
            }
            
            if (char === '"' && !escapeNext) {
              inString = !inString;
              currentObj += char;
              continue;
            }
            
            if (!inString) {
              if (char === '{') {
                braceDepth++;
                currentObj += char;
              } else if (char === '}') {
                braceDepth--;
                currentObj += char;
                
                if (braceDepth === 0 && currentObj.trim()) {
                  // Complete question object found
                  try {
                    const questionObj = JSON.parse(currentObj.trim());
                    questions.push(questionObj);
                    currentObj = '';
                  } catch (e) {
                    // Skip invalid question
                    logger.warn(`Skipping invalid question object in truncated JSON`);
                    currentObj = '';
                  }
                }
              } else {
                currentObj += char;
              }
            } else {
              currentObj += char;
            }
          }
          
          if (questions.length > 0) {
            logger.info(`Successfully extracted ${questions.length} complete questions from truncated JSON`);
            return { 
              questions,
              _warning: `Truncated response: only ${questions.length} questions recovered` 
            };
          }
        }
        
        // Create a more readable error message with context
        const preview = jsonString.length > 500 
          ? jsonString.substring(0, 500) + '...' 
          : jsonString;
        
        // Check if this is clearly a truncation issue
        const isTruncated = jsonString.length > 1000 && (
          (quoteCount % 2 !== 0) || 
          (closeBraces < openBraces) || 
          (closeBrackets < openBrackets)
        );
        
        if (isTruncated) {
          throw new Error(
            `Failed to parse quiz JSON: Response was truncated mid-generation. ` +
            `Try reducing question count or using a simpler difficulty level. ` +
            `Preview: ${preview}`
          );
        }
        
        throw new Error(`Failed to parse quiz JSON. Preview: ${preview}`);
      }
    }
    
    // Step 4: Normalize the parsed structure
    // Handle if the result is wrapped in additional structure
    if (parsed.quiz) return parsed.quiz;
    if (parsed.questions && Array.isArray(parsed.questions)) return parsed;
    if (Array.isArray(parsed)) return { questions: parsed };
    
    // If no questions found, throw error
    if (!parsed.questions) {
      throw new Error('Parsed JSON does not contain a "questions" array');
    }
    
    return parsed;
  } catch (error: any) {
    // Ensure error message is a proper string, not character-by-character object
    const errorMessage = typeof error.message === 'string' 
      ? error.message 
      : JSON.stringify(error.message || error);
    throw new Error(errorMessage);
  }
};

/**
 * Normalize question data: map sourceTimestamp to sourceSegment
 */
export const normalizeQuizQuestion = (
  question: any,
  fallbackStartTime: number,
  fallbackEndTime: number
): any => {
  // Use sourceSegment if present, otherwise use sourceTimestamp, otherwise use fallback
  const sourceSegment = 
    question.sourceSegment || 
    question.sourceTimestamp || 
    { startTime: fallbackStartTime, endTime: fallbackEndTime };
  
  return {
    question: question.question,
    type: question.type,
    options: question.options,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    difficulty: question.difficulty,
    sourceSegment: {
      startTime: sourceSegment.startTime,
      endTime: sourceSegment.endTime,
    },
    points: question.points || (question.type === 'essay' ? 20 : 10),
    tags: question.tags || [],
  };
};
