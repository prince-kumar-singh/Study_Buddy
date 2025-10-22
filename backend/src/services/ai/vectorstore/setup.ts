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

    const embeddings = createEmbeddings();

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
 * Delete documents by content ID
 */
export const deleteContentFromVectorStore = async (contentId: string): Promise<void> => {
  try {
    if (!pineconeClient) {
      throw new Error('Pinecone client not initialized');
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'study-buddy-transcripts';
    const index = pineconeClient.Index(indexName);

    // Delete all vectors with this contentId in metadata
    await index.namespace('').deleteMany({
      filter: { contentId: { $eq: contentId } },
    });

    logger.info(`Deleted content ${contentId} from vector store`);
  } catch (error) {
    logger.error('Error deleting content from vector store:', error);
    throw error;
  }
};
