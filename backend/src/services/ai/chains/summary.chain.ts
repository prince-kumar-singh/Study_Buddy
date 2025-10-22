import { LLMChain } from 'langchain/chains';
import { createLLM } from '../../../config/langchain.config';
import {
  quickSummaryPrompt,
  briefSummaryPrompt,
  detailedSummaryPrompt,
  conceptExtractionPrompt,
} from '../prompts/summary.prompts';
import { conceptParser } from '../parsers/flashcard.parser';
import { logger } from '../../../config/logger';

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
  type: SummaryType = 'brief'
): Promise<SummaryResult> => {
  const startTime = Date.now();

  try {
    // Select appropriate prompt based on type
    let prompt;
    switch (type) {
      case 'quick':
        prompt = quickSummaryPrompt;
        break;
      case 'detailed':
        prompt = detailedSummaryPrompt;
        break;
      default:
        prompt = briefSummaryPrompt;
    }

    // Create LLM with appropriate temperature
    const llm = createLLM({
      temperature: 0.3, // Lower temperature for more focused summaries
    });

    // Create chain
    const chain = new LLMChain({
      llm,
      prompt,
    });

    // Generate summary
    const result = await chain.call({
      content: content.substring(0, 8000), // Limit content length
    });

    const summaryContent = result.text.trim();
    const wordCount = summaryContent.split(/\s+/).length;
    const generationTime = Date.now() - startTime;

    logger.info(`Generated ${type} summary: ${wordCount} words in ${generationTime}ms`);

    // Extract concepts for detailed summaries
    let concepts;
    if (type === 'detailed') {
      try {
        concepts = await extractConcepts(content);
      } catch (error) {
        logger.error('Failed to extract concepts:', error);
      }
    }

    return {
      content: summaryContent,
      wordCount,
      generationTime,
      model: 'gemini-pro',
      concepts,
    };
  } catch (error) {
    logger.error('Error generating summary:', error);
    throw new Error('Failed to generate summary');
  }
};

/**
 * Extract key concepts from content
 */
export const extractConcepts = async (content: string): Promise<{
  topics: string[];
  concepts: string[];
  terms: Array<{ term: string; definition: string }>;
}> => {
  try {
    const llm = createLLM({ temperature: 0.3 });

    const chain = new LLMChain({
      llm,
      prompt: conceptExtractionPrompt,
      outputParser: conceptParser,
    });

    const result = await chain.call({
      content: content.substring(0, 10000),
    });

    return result.text;
  } catch (error) {
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
