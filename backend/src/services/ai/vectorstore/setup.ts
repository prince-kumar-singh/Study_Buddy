import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { createEmbeddings } from '../../../config/langchain.config';
import { logger } from '../../../config/logger';

let pineconeClient: Pinecone | null = null;
let vectorStore: PineconeStore | null = null;

/**
 * Initialize Pinecone vector store
 */
export const initializeVectorStore = async (): Promise<void> => {
  try {
    if (!process.env.PINECONE_API_KEY) {
      logger.warn('Pinecone API key not found, vector store disabled');
      return;
    }

    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'study-buddy-transcripts';

    // Check if index exists
    const indexes = await pineconeClient.listIndexes();
    const indexExists = indexes.indexes?.some((idx) => idx.name === indexName);

    if (!indexExists) {
      logger.info(`Creating Pinecone index: ${indexName}`);
      await pineconeClient.createIndex({
        name: indexName,
        dimension: 768, // Google embeddings dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      // Wait for index to be ready
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    const index = pineconeClient.Index(indexName);

    const embeddings = await createEmbeddings();

    vectorStore = new PineconeStore(embeddings, {
      pineconeIndex: index,
    });

    logger.info('Pinecone vector store initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Pinecone vector store:', error);
    throw error;
  }
};

/**
 * Get vector store instance
 */
export const getVectorStore = (): PineconeStore => {
  if (!vectorStore) {
    throw new Error('Vector store not initialized. Call initializeVectorStore() first.');
  }
  return vectorStore;
};

/**
 * Get Pinecone client instance
 */
export const getPineconeClient = (): Pinecone | null => {
  return pineconeClient;
};

/**
 * Add documents to vector store
 */
export const addDocumentsToVectorStore = async (
  documents: Array<{
    pageContent: string;
    metadata: {
      contentId: string;
      startTime?: number;
      endTime?: number;
      speaker?: string;
      [key: string]: any;
    };
  }>
): Promise<string[]> => {
  try {
    const store = getVectorStore();
    const ids = await store.addDocuments(documents);
    logger.info(`Added ${documents.length} documents to vector store`);
    return ids;
  } catch (error) {
    logger.error('Error adding documents to vector store:', error);
    throw error;
  }
};

/**
 * Delete documents by content ID using Pinecone's metadata filter
 * @see https://docs.pinecone.io/guides/data/delete-data#delete-records-by-metadata
 * @see https://docs.pinecone.io/docs/metadata-filtering#deleting-vectors-by-metadata-filter
 */
export const deleteContentFromVectorStore = async (
  contentId: string, 
  options: { retries?: number; throwOnError?: boolean } = {}
): Promise<void> => {
  const { retries = 3, throwOnError = true } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!pineconeClient) {
        const error = new Error('Pinecone client not initialized');
        logger.error(error.message);
        if (throwOnError) throw error;
        return;
      }

      const indexName = process.env.PINECONE_INDEX_NAME || 'study-buddy-transcripts';
      const index = pineconeClient.Index(indexName);

      // Use Pinecone's deleteMany() with metadata filter
      // deleteMany accepts either an array of IDs or a filter object
      await index.namespace('').deleteMany({
        contentId: { $eq: contentId },
      });

      logger.info(`Deleted vectors for content ${contentId} from vector store (attempt ${attempt}/${retries})`);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Failed to delete vectors for content ${contentId} (attempt ${attempt}/${retries}):`, error);
      
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  logger.error(`Failed to delete vectors for content ${contentId} after ${retries} attempts:`, lastError);
  if (throwOnError && lastError) {
    throw lastError;
  }
};


