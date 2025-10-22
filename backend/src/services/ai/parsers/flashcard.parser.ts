import { z } from 'zod';
import { StructuredOutputParser } from 'langchain/output_parsers';

// Flashcard schema
export const flashcardSchema = z.object({
  front: z.string().describe('The question or prompt on the front of the flashcard'),
  back: z.string().describe('The answer or explanation on the back of the flashcard'),
  type: z.enum(['mcq', 'truefalse', 'fillin', 'essay']).describe('The type of flashcard'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('The difficulty level'),
  sourceTimestamp: z
    .object({
      startTime: z.number().describe('Start time in milliseconds'),
      endTime: z.number().describe('End time in milliseconds'),
    })
    .describe('The source segment this flashcard is based on'),
  tags: z.array(z.string()).optional().describe('Related topics or tags'),
});

export const flashcardsArraySchema = z.array(flashcardSchema);

export const flashcardParser = StructuredOutputParser.fromZodSchema(flashcardsArraySchema);

// Quiz schema
export const quizQuestionSchema = z.object({
  question: z.string().describe('The quiz question'),
  type: z.enum(['mcq', 'truefalse', 'short_answer']).describe('Question type'),
  options: z
    .array(z.string())
    .optional()
    .describe('Options for multiple choice questions'),
  correctAnswer: z.string().describe('The correct answer'),
  explanation: z.string().describe('Explanation of the correct answer'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).describe('Difficulty level'),
  sourceTimestamp: z
    .object({
      startTime: z.number(),
      endTime: z.number(),
    })
    .optional(),
  points: z.number().default(1).describe('Points for this question'),
});

export const quizArraySchema = z.array(quizQuestionSchema);

export const quizParser = StructuredOutputParser.fromZodSchema(quizArraySchema);

// Concept extraction schema
export const conceptSchema = z.object({
  topics: z.array(z.string()).describe('Main topics covered'),
  concepts: z.array(z.string()).describe('Key concepts'),
  terms: z
    .array(
      z.object({
        term: z.string(),
        definition: z.string(),
      })
    )
    .describe('Important terms and definitions'),
});

export const conceptParser = StructuredOutputParser.fromZodSchema(conceptSchema);
