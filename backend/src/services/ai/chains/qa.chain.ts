import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { createLLM, getCurrentModelName, safeChainCall } from '../../../config/langchain.config';
import { AITaskType } from '../../../config/ai.config';
import { qaSystemPrompt } from '../prompts/summary.prompts';
import { getVectorStoreRetriever } from '../retrievers/transcript.retriever';
import { logger } from '../../../config/logger';
import { ModelSelector } from '../utils/model-selector';

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

export interface QAStreamCallback {
  onToken: (token: string) => void;
  onComplete: (fullAnswer: string) => void;
  onError: (error: Error) => void;
}

/**
 * Ask a question about specific content using RAG
 */
export const askQuestion = async (
  contentId: string,
  question: string,
  conversationHistory?: Array<{ question: string; answer: string }>,
  streaming?: boolean
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

    // Use Model Selector to choose appropriate model (streaming or standard)
    const selectedModel = ModelSelector.selectQAModel(streaming);

    // Create LLM
    const llm = await createLLM(
      streaming ? AITaskType.QA_STREAMING : AITaskType.QA_SIMPLE,
      {
        temperature: 0.5, // Balance between creativity and accuracy
        modelName: selectedModel,
      }
    );

    // Create conversational retrieval chain
    const chain = ConversationalRetrievalQAChain.fromLLM(llm as any, retriever as any, { // Type assertions for version mismatch
      memory,
      returnSourceDocuments: true,
      qaChainOptions: {
        type: 'stuff', // Use 'stuff' for shorter context, 'map_reduce' for longer
        prompt: qaSystemPrompt as any,
      },
    });

    // Ask question
    const result = await safeChainCall(chain, {
      question,
    }, {
      taskType: streaming ? 'qa_streaming' : 'qa_standard',
      modelName: selectedModel,
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
    
    // Log model usage for monitoring
    ModelSelector.logModelUsage(selectedModel, streaming ? 'qa-streaming' : 'qa-standard', responseTime);

    logger.info(`Answered question for content ${contentId} in ${responseTime}ms using ${selectedModel}`);

    return {
      answer: result.text || result.answer,
      sourceSegments,
      responseTime,
      model: selectedModel,
    };
  } catch (error: any) {
    logger.error('Error answering question:', {
      error: error.message,
      contentId,
      question: question.substring(0, 100),
    });
    
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      throw new Error(
        'AI model not available. Please try again later or contact support.'
      );
    }
    
    throw new Error(`Failed to answer question: ${error.message}`);
  }
};

/**
 * Ask a question with streaming support using gemini-2.5-flash-live
 * Returns an async generator that yields tokens as they arrive
 */
export async function* askQuestionStream(
  contentId: string,
  question: string,
  conversationHistory?: Array<{ question: string; answer: string }>
): AsyncGenerator<{ token: string; done: boolean; sourceSegments?: Array<any> }, void, unknown> {
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

    // Use streaming model (gemini-2.5-flash-live optimized for streaming)
    const selectedModel = ModelSelector.selectQAModel(true);
    logger.info(`Starting streaming Q&A for content ${contentId} using ${selectedModel}`);

    // Create LLM with streaming enabled
    const llm = await createLLM(
      AITaskType.QA_STREAMING,
      {
        temperature: 0.5,
        modelName: selectedModel,
      }
    );

    // Get relevant documents first
    const docs = await retriever.getRelevantDocuments(question);
    
    // Extract source segments
    const sourceSegments = docs
      .filter((doc: any) => doc.metadata)
      .map((doc: any, index: number) => ({
        startTime: doc.metadata.startTime || 0,
        endTime: doc.metadata.endTime || 0,
        relevance: 1 - index * 0.1,
      }))
      .slice(0, 3);

    // Build context from retrieved documents
    const context = docs.map((doc: any) => doc.pageContent).join('\n\n');

    // Create prompt for streaming
    const prompt = `You are a helpful AI tutor assistant. Use the following context to answer the student's question accurately and concisely.

Context: ${context}

Question: ${question}

Answer:`;

    const stream = await llm.stream(prompt);
    
    let fullAnswer = '';
    
    for await (const chunk of stream) {
      const token = chunk.content.toString();
      fullAnswer += token;
      
      yield {
        token,
        done: false,
      };
    }

    // Log completion
    const responseTime = Date.now() - startTime;
    ModelSelector.logModelUsage(selectedModel, 'qa-streaming', responseTime);
    logger.info(`Completed streaming Q&A for content ${contentId} in ${responseTime}ms`);

    // Final chunk with source segments
    yield {
      token: '',
      done: true,
      sourceSegments,
    };

  } catch (error: any) {
    logger.error('Error in streaming Q&A:', {
      error: error.message,
      contentId,
      question: question.substring(0, 100),
    });
    
    throw new Error(`Failed to stream answer: ${error.message}`);
  }
}

/**
 * Generate follow-up questions based on answer
 */
export const generateFollowUpQuestions = async (
  question: string,
  answer: string
): Promise<string[]> => {
  try {
    // Use Flash model for follow-up questions (simple task)
    const selectedModel = ModelSelector.selectQAModel(false);
    
    const llm = await createLLM(
      AITaskType.QA_SIMPLE,
      { 
        temperature: 0.8,
        modelName: selectedModel,
      }
    );

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
