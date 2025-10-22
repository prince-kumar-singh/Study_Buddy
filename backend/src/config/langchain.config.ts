import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

export const langchainConfig = {
  llm: {
    modelName: process.env.GEMINI_MODEL_NAME || 'gemini-pro',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
    maxOutputTokens: 2048,
    topK: 40,
    topP: 0.95,
  },
  embeddings: {
    modelName: 'embedding-001',
  },
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
  },
  tracing: {
    enabled: process.env.LANGCHAIN_TRACING_V2 === 'true',
    project: process.env.LANGCHAIN_PROJECT || 'study-buddy',
  },
};

// Initialize LLM
export const createLLM = (options?: Partial<typeof langchainConfig.llm>) => {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GEMINI_API_KEY,
    modelName: options?.modelName || langchainConfig.llm.modelName,
    temperature: options?.temperature || langchainConfig.llm.temperature,
    maxOutputTokens: options?.maxOutputTokens || langchainConfig.llm.maxOutputTokens,
  });
};

// Initialize Embeddings
export const createEmbeddings = () => {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GEMINI_API_KEY,
    modelName: langchainConfig.embeddings.modelName,
  });
};
