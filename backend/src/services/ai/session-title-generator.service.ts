import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { logger } from '../../config/logger';

/**
 * Generate AI-powered session titles from conversation context
 */
export class SessionTitleGenerator {
  private model: ChatGoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GOOGLE_GEMINI_API_KEY environment variable is required');
    }

    this.model = new ChatGoogleGenerativeAI({
      modelName: 'gemini-2.5-flash', // Use stable production model
      temperature: 0.7,
      maxOutputTokens: 50,
      apiKey: apiKey.trim(), // Remove any whitespace
    });
  }

  /**
   * Generate a concise, descriptive title from the first question and answer
   */
  async generateTitle(question: string, answer?: string): Promise<string> {
    try {
      const prompt = PromptTemplate.fromTemplate(
        `Generate a concise, descriptive title (max 6 words) for a study chat session based on this question{answerContext}.

Question: {question}
{answerText}

Title should be:
- Short and memorable (max 6 words)
- Capture the main topic
- Use title case
- No quotes or special characters

Title:`
      );

      const answerContext = answer ? ' and answer' : '';
      const answerText = answer ? `Answer: ${answer.slice(0, 200)}...` : '';

      const response = await this.model.invoke(
        await prompt.format({
          question,
          answerContext,
          answerText,
        })
      );

      const title = response.content
        .toString()
        .trim()
        .replace(/^["']|["']$/g, '') // Remove quotes
        .slice(0, 60); // Max 60 chars

      return title || question.slice(0, 50);
    } catch (error) {
      logger.error('Failed to generate AI title:', error);
      // Fallback to question truncation
      return question.slice(0, 50) + (question.length > 50 ? '...' : '');
    }
  }

  /**
   * Generate title from multiple Q&A pairs for better context
   */
  async generateTitleFromConversation(
    questions: string[],
    answers: string[]
  ): Promise<string> {
    try {
      const conversationContext = questions
        .slice(0, 3)
        .map((q, i) => `Q: ${q}\nA: ${answers[i]?.slice(0, 100)}...`)
        .join('\n\n');

      const prompt = PromptTemplate.fromTemplate(
        `Generate a concise, descriptive title (max 6 words) for this study chat session:

{conversation}

Title should summarize the main topic covered. Use title case, no quotes.

Title:`
      );

      const response = await this.model.invoke(
        await prompt.format({ conversation: conversationContext })
      );

      const title = response.content
        .toString()
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, 60);

      return title || questions[0].slice(0, 50);
    } catch (error) {
      logger.error('Failed to generate AI title from conversation:', error);
      return questions[0].slice(0, 50) + (questions[0].length > 50 ? '...' : '');
    }
  }
}

export const sessionTitleGenerator = new SessionTitleGenerator();
