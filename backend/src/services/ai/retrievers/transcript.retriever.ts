import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { getVectorStore } from '../vectorstore/setup';

/**
 * Create a filtered retriever for specific content
 */
export const getVectorStoreRetriever = async (
  contentId: string,
  k: number = 4
): Promise<VectorStoreRetriever> => {
  const vectorStore = getVectorStore();

  // Create retriever with filter for specific content
  const retriever = vectorStore.asRetriever({
    k, // Number of documents to retrieve
    filter: {
      contentId: { $eq: contentId },
    },
    searchType: 'similarity',
  });

  return retriever;
};

/**
 * Search for relevant segments across all user content
 */
export const searchAcrossContent = async (
  userId: string,
  query: string,
  k: number = 5
): Promise<
  Array<{
    content: string;
    contentId: string;
    startTime?: number;
    endTime?: number;
    relevance: number;
  }>
> => {
  const vectorStore = getVectorStore();

  const results = await vectorStore.similaritySearchWithScore(query, k, {
    userId: { $eq: userId },
  });

  return results.map(([doc, score]) => ({
    content: doc.pageContent,
    contentId: doc.metadata.contentId,
    startTime: doc.metadata.startTime,
    endTime: doc.metadata.endTime,
    relevance: score,
  }));
};
