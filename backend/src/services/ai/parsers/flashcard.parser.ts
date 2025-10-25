import { z } from 'zod';
import { StructuredOutputParser } from 'langchain/output_parsers';

// Type-specific validation rules
const mcqFrontPattern = /\b(what|which|who|when|where|why|how|select|choose)\b/i;
const trueFalseFrontPattern = /\b(true|false|correct|incorrect|is it|does|do|can|will|should)\b/i;
const fillInFrontPattern = /\b(____|blank|fill|complete)\b/i;

// Flashcard schema with type-specific validation
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
}).refine((data) => {
  // Type-specific validation
  switch (data.type) {
    case 'mcq':
      // MCQ should have question format and multiple options in back
      if (!mcqFrontPattern.test(data.front)) {
        console.warn(`MCQ flashcard may not have proper question format: "${data.front.substring(0, 50)}..."`);
      }
      break;
    case 'truefalse':
      // True/False should have yes/no question and true/false answer
      const backLower = data.back.toLowerCase();
      if (!trueFalseFrontPattern.test(data.front)) {
        console.warn(`True/False flashcard may not have proper statement format: "${data.front.substring(0, 50)}..."`);
      }
      if (!backLower.includes('true') && !backLower.includes('false')) {
        console.warn(`True/False flashcard should contain "true" or "false" in answer: "${data.back.substring(0, 50)}..."`);
      }
      break;
    case 'fillin':
      // Fill-in should have blank indicator
      if (!fillInFrontPattern.test(data.front)) {
        console.warn(`Fill-in flashcard should contain blank indicator: "${data.front.substring(0, 50)}..."`);
      }
      break;
    case 'essay':
      // Essay questions should be open-ended
      if (data.front.split(' ').length < 5) {
        console.warn(`Essay flashcard question seems too short: "${data.front}"`);
      }
      break;
  }
  return true; // Always pass but log warnings
}, {
  message: "Flashcard type validation warning"
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

/**
 * Custom concept parser with fallback for truncated JSON
 * Handles cases where LLM response is cut off mid-JSON
 */
class RobustConceptParser {
  private baseParser: StructuredOutputParser<typeof conceptSchema>;

  constructor() {
    this.baseParser = StructuredOutputParser.fromZodSchema(conceptSchema);
  }

  getFormatInstructions(): string {
    return this.baseParser.getFormatInstructions();
  }

  async parse(text: string): Promise<z.infer<typeof conceptSchema>> {
    try {
      // Try standard parsing first
      return await this.baseParser.parse(text);
    } catch (error) {
      // If parsing fails, try to extract partial JSON
      console.warn('Standard parsing failed, attempting to recover partial JSON');
      
      try {
        // Remove markdown code fences if present
        let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
        
        // Try to fix common truncation issues
        // If JSON ends with incomplete object in terms array, close it properly
        if (cleanText.includes('"terms"') && !cleanText.endsWith('}')) {
          // Find the last complete term object
          const termsMatch = cleanText.match(/"terms":\s*\[(.*)/s);
          if (termsMatch) {
            let termsContent = termsMatch[1];
            
            // Count opening and closing braces
            const openBraces = (termsContent.match(/{/g) || []).length;
            const closeBraces = (termsContent.match(/}/g) || []).length;
            
            // Close incomplete objects
            for (let i = closeBraces; i < openBraces; i++) {
              termsContent += '}';
            }
            
            // Close the terms array and main object
            if (!termsContent.includes(']')) {
              termsContent += ']';
            }
            if (!cleanText.endsWith('}')) {
              cleanText = cleanText.substring(0, cleanText.lastIndexOf('"terms"')) + 
                          '"terms": [' + termsContent;
              if (!cleanText.endsWith('}')) {
                cleanText += '}';
              }
            }
          }
        }
        
        const parsed = JSON.parse(cleanText);
        return conceptSchema.parse(parsed);
      } catch (recoveryError) {
        // If recovery fails, return empty structure to prevent complete failure
        console.error('Could not recover from truncated JSON, returning empty structure');
        return {
          topics: [],
          concepts: [],
          terms: [],
        };
      }
    }
  }

  async parseResult(generations: any): Promise<z.infer<typeof conceptSchema>> {
    // Handle different LangChain response structures
    if (Array.isArray(generations) && generations.length > 0) {
      const text = generations[0]?.text || generations[0]?.message?.content || '';
      return this.parse(text);
    }
    
    // Handle direct text or message object
    const text = generations?.text || generations?.message?.content || '';
    return this.parse(text);
  }

  async parseResultWithPrompt(generations: any, _prompt: any): Promise<z.infer<typeof conceptSchema>> {
    return this.parseResult(generations);
  }
}

export const conceptParser = new RobustConceptParser() as any;

/**
 * Parse flashcard JSON with robust error handling
 * Similar to parseQuizJson but for flashcard arrays
 */
export const parseFlashcardJson = (jsonString: string): any[] => {
  try {
    // Step 1: Clean markdown fences and extra whitespace
    let cleaned = jsonString.trim();
    
    // Remove markdown code fences (```json or ``` at start/end)
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```\s*$/i, '');
    cleaned = cleaned.trim();
    
    // Step 2: Try to parse the cleaned JSON
    let parsed: any;
    
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError: any) {
      // Step 3: Handle truncated/incomplete JSON
      console.warn('JSON parsing failed, attempting recovery:', parseError.message);
      
      // Find the last complete object
      const lastBraceIndex = cleaned.lastIndexOf('}');
      
      if (lastBraceIndex === -1) {
        throw new Error(`No valid JSON objects found. Text: "${jsonString.substring(0, 200)}..."`);
      }
      
      // Try to fix truncated JSON by adding missing closing brackets
      let truncated = cleaned;
      
      // Count opening and closing braces/brackets
      const openBraces = (cleaned.match(/{/g) || []).length;
      const closeBraces = (cleaned.match(/}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/]/g) || []).length;
      
      // Add missing closing brackets first (for arrays)
      if (closeBrackets < openBrackets) {
        truncated += ']'.repeat(openBrackets - closeBrackets);
      }
      
      // Then add missing braces (for objects)
      if (closeBraces < openBraces) {
        // Check if we're in the middle of a string value
        // Count quotes to see if we have an unterminated string
        const quotes = (truncated.match(/"/g) || []).length;
        if (quotes % 2 !== 0) {
          // Unterminated string - close it
          truncated += '"';
        }
        
        // Now add missing braces
        truncated += '}'.repeat(openBraces - closeBraces);
      }
      
      try {
        parsed = JSON.parse(truncated);
      } catch (truncateError) {
        // Last resort: extract only complete objects
        // Find the last valid closing brace for an object in an array
        const arrayMatch = cleaned.match(/\[(.*)\]/s);
        if (arrayMatch) {
          // Try to extract just complete objects from the array
          const objectsText = arrayMatch[1];
          const objects: any[] = [];
          let currentObj = '';
          let braceDepth = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < objectsText.length; i++) {
            const char = objectsText[i];
            
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
            
            if (char === '"') {
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
                  // Complete object found
                  try {
                    objects.push(JSON.parse(currentObj.trim()));
                    currentObj = '';
                  } catch (e) {
                    // Skip invalid object
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
          
          if (objects.length > 0) {
            return objects;
          }
        }
        
        throw new Error(`Failed to parse flashcard JSON. Text: "${jsonString.substring(0, 200)}...". Error: ${parseError.message}`);
      }
    }
    
    // Step 4: Normalize the parsed structure
    if (Array.isArray(parsed)) return parsed;
    if (parsed.flashcards && Array.isArray(parsed.flashcards)) return parsed.flashcards;
    
    // If single object, wrap in array
    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed];
    }
    
    throw new Error('Parsed JSON is not in expected flashcard format');
  } catch (error: any) {
    throw new Error(error.message || 'Failed to parse flashcard JSON: Invalid format');
  }
};
