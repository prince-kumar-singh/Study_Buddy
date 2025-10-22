import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { createLLM } from '../../../config/langchain.config';
import { qaSystemPrompt } from '../prompts/summary.prompts';
import { getVectorStoreRetriever } from '../retrievers/transcript.retriever';
import { logger } from '../../../config/logger';

export interface QAResult {
  answer: string;
  sourceSegments: Array<{
    startTime: number;
    endTime: number;
    relevance: number;
  }>;
  responseTime: number;
  model: string;
  confidence?: number;
}

/**
 * Ask a question about specific content using RAG
 */
export const askQuestion = async (
  contentId: string,
  question: string,
  conversationHistory?: Array<{ question: string; answer: string }>
): Promise<QAResult> => {
  const startTime = Date.now();

  try {
    // Get retriever for this content
    const retriever = await getVectorStoreRetriever(contentId);

    // Create memory for conversation context
    const memory = new BufferMemory({
      memoryKey: 'chat_history',
      returnMessages: true,
    });

    // Load previous conversation into memory
    if (conversationHistory && conversationHistory.length > 0) {
      for (const exchange of conversationHistory) {
        await memory.saveContext(
          { input: exchange.question },
          { output: exchange.answer }
        );
      }
    }

    // Create LLM
    const llm = createLLM({
      temperature: 0.5, // Balance between creativity and accuracy
    });

    // Create conversational retrieval chain
    const chain = ConversationalRetrievalQAChain.fromLLM(llm, retriever, {
      memory,
      returnSourceDocuments: true,
      qaChainOptions: {
        type: 'stuff', // Use 'stuff' for shorter context, 'map_reduce' for longer
        prompt: qaSystemPrompt,
      },
    });

    // Ask question
    const result = await chain.call({
      question,
    });

    // Extract source segments from returned documents
    const sourceSegments = (result.sourceDocuments || [])
      .filter((doc: any) => doc.metadata)
      .map((doc: any, index: number) => ({
        startTime: doc.metadata.startTime || 0,
        endTime: doc.metadata.endTime || 0,
        relevance: 1 - index * 0.1, // Decreasing relevance by position
      }))
      .slice(0, 3); // Top 3 most relevant segments

    const responseTime = Date.now() - startTime;

    logger.info(`Answered question for content ${contentId} in ${responseTime}ms`);

    return {
      answer: result.text || result.answer,
      sourceSegments,
      responseTime,
      model: 'gemini-pro',
    };
  } catch (error) {
    logger.error('Error answering question:', error);
    throw new Error('Failed to answer question');
  }
};

/**
 * Generate follow-up questions based on answer
 */
export const generateFollowUpQuestions = async (
  question: string,
  answer: string
): Promise<string[]> => {
  try {
    const llm = createLLM({ temperature: 0.8 });

    const prompt = `Based on this Q&A exchange, suggest 3 relevant follow-up questions that would help deepen understanding:

Question: ${question}
Answer: ${answer}

Generate 3 follow-up questions (one per line):`;

    const result = await llm.invoke(prompt);
    
    const questions = result.content
      .toString()
      .split('\n')
      .filter((q: string) => q.trim().length > 0)
      .slice(0, 3);

    return questions;
  } catch (error) {
    logger.error('Error generating follow-up questions:', error);
    return [];
  }
};
