import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../../config/logger';

/**
 * LangChain Document Loaders Service
 * Handles loading and processing of PDF, DOCX, and TXT files
 */

export interface DocumentLoadResult {
  documents: Document[];
  metadata: {
    totalPages?: number;
    totalCharacters: number;
    totalChunks: number;
    sourceType: 'pdf' | 'docx' | 'txt';
    fileName: string;
  };
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

/**
 * Default chunking configuration
 * Based on LangChain best practices for educational content
 */
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 500, // 500 tokens per chunk
  chunkOverlap: 100, // 100 token overlap for context continuity
  separators: ['\n\n', '\n', '. ', ' ', ''], // Priority order for splitting
};

/**
 * Load PDF document using LangChain PDFLoader
 * @param filePath - Path to PDF file
 * @returns Loaded documents
 */
export const loadPDF = async (filePath: string): Promise<Document[]> => {
  try {
    logger.info(`Loading PDF from: ${filePath}`);
    
    const loader = new PDFLoader(filePath, {
      splitPages: true, // Split into separate documents per page
    });
    
    const documents = await loader.load();
    
    logger.info(`PDF loaded successfully: ${documents.length} pages`);
    return documents;
  } catch (error) {
    logger.error(`Failed to load PDF: ${filePath}`, error);
    throw new Error(`PDF loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Load DOCX document using LangChain DocxLoader
 * @param filePath - Path to DOCX file
 * @returns Loaded documents
 */
export const loadDOCX = async (filePath: string): Promise<Document[]> => {
  try {
    logger.info(`Loading DOCX from: ${filePath}`);
    
    const loader = new DocxLoader(filePath);
    const documents = await loader.load();
    
    logger.info(`DOCX loaded successfully: ${documents.length} document(s)`);
    return documents;
  } catch (error) {
    logger.error(`Failed to load DOCX: ${filePath}`, error);
    throw new Error(`DOCX loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Load TXT document using LangChain TextLoader
 * @param filePath - Path to TXT file
 * @returns Loaded documents
 */
export const loadTXT = async (filePath: string): Promise<Document[]> => {
  try {
    logger.info(`Loading TXT from: ${filePath}`);
    
    const loader = new TextLoader(filePath);
    const documents = await loader.load();
    
    logger.info(`TXT loaded successfully: ${documents.length} document(s)`);
    return documents;
  } catch (error) {
    logger.error(`Failed to load TXT: ${filePath}`, error);
    throw new Error(`TXT loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Load document based on file type
 * Automatically detects file type and uses appropriate loader
 * @param filePath - Path to document file
 * @param fileType - File type (pdf, docx, txt)
 * @returns Loaded documents
 */
export const loadDocument = async (
  filePath: string,
  fileType: 'pdf' | 'docx' | 'txt'
): Promise<Document[]> => {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return await loadPDF(filePath);
    case 'docx':
    case 'doc':
      return await loadDOCX(filePath);
    case 'txt':
      return await loadTXT(filePath);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
};

/**
 * Chunk documents using RecursiveCharacterTextSplitter
 * Implements the recommended chunking strategy for educational content
 * @param documents - Array of documents to chunk
 * @param options - Chunking options
 * @returns Chunked documents
 */
export const chunkDocuments = async (
  documents: Document[],
  options: ChunkingOptions = {}
): Promise<Document[]> => {
  const { chunkSize, chunkOverlap, separators } = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
  };

  try {
    logger.info(`Chunking ${documents.length} document(s) with size: ${chunkSize}, overlap: ${chunkOverlap}`);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const chunks = await splitter.splitDocuments(documents);

    logger.info(`Documents chunked into ${chunks.length} chunks`);
    return chunks;
  } catch (error) {
    logger.error('Failed to chunk documents', error);
    throw new Error(`Document chunking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Load and process document with chunking
 * Complete pipeline: Load → Chunk → Add metadata
 * @param filePath - Path to document file
 * @param fileType - File type (pdf, docx, txt)
 * @param chunkingOptions - Optional chunking configuration
 * @returns Document load result with metadata
 */
export const loadAndProcessDocument = async (
  filePath: string,
  fileType: 'pdf' | 'docx' | 'txt',
  chunkingOptions?: ChunkingOptions
): Promise<DocumentLoadResult> => {
  try {
    // Load document
    const documents = await loadDocument(filePath, fileType);

    // Chunk documents
    const chunkedDocuments = await chunkDocuments(documents, chunkingOptions);

    // Calculate total characters
    const totalCharacters = chunkedDocuments.reduce(
      (sum, doc) => sum + doc.pageContent.length,
      0
    );

    // Extract page count for PDFs
    const totalPages = fileType === 'pdf' ? documents.length : undefined;

    // Add additional metadata to each chunk
    const fileName = path.basename(filePath);
    const enrichedDocuments = chunkedDocuments.map((doc, index) => {
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          fileName,
          fileType,
          chunkIndex: index,
          totalChunks: chunkedDocuments.length,
          chunkSize: doc.pageContent.length,
        },
      });
    });

    logger.info(`Document processing complete: ${fileName} (${totalCharacters} chars, ${chunkedDocuments.length} chunks)`);

    return {
      documents: enrichedDocuments,
      metadata: {
        totalPages,
        totalCharacters,
        totalChunks: chunkedDocuments.length,
        sourceType: fileType,
        fileName,
      },
    };
  } catch (error) {
    logger.error(`Failed to load and process document: ${filePath}`, error);
    throw error;
  }
};

/**
 * Save buffer to temporary file
 * Helper function to save file buffer to temp directory
 * @param buffer - File buffer
 * @param fileName - Original file name
 * @returns Path to temporary file
 */
export const saveBufferToTempFile = async (
  buffer: Buffer,
  fileName: string
): Promise<string> => {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `study-buddy-${Date.now()}-${fileName}`);

  try {
    await fs.promises.writeFile(tempFilePath, buffer);
    logger.info(`Buffer saved to temporary file: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    logger.error('Failed to save buffer to temporary file', error);
    throw new Error(`Failed to save temporary file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete temporary file
 * Clean up temporary files after processing
 * @param filePath - Path to temporary file
 */
export const deleteTempFile = async (filePath: string): Promise<void> => {
  try {
    await fs.promises.unlink(filePath);
    logger.info(`Temporary file deleted: ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to delete temporary file: ${filePath}`, error);
    // Don't throw error, just log warning
  }
};

/**
 * Process uploaded file buffer
 * Complete pipeline for uploaded file: Buffer → Temp File → Load → Process → Clean up
 * @param buffer - File buffer from multer
 * @param fileName - Original file name
 * @param fileType - File type
 * @param chunkingOptions - Optional chunking configuration
 * @returns Document load result
 */
export const processUploadedFile = async (
  buffer: Buffer,
  fileName: string,
  fileType: 'pdf' | 'docx' | 'txt',
  chunkingOptions?: ChunkingOptions
): Promise<DocumentLoadResult> => {
  let tempFilePath: string | null = null;

  try {
    // Save buffer to temporary file
    tempFilePath = await saveBufferToTempFile(buffer, fileName);

    // Load and process document
    const result = await loadAndProcessDocument(tempFilePath, fileType, chunkingOptions);

    return result;
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      await deleteTempFile(tempFilePath);
    }
  }
};

/**
 * Get document statistics
 * Extract useful statistics from loaded documents
 * @param documents - Array of documents
 * @returns Document statistics
 */
export const getDocumentStatistics = (documents: Document[]): {
  totalDocuments: number;
  totalCharacters: number;
  averageChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
} => {
  const totalCharacters = documents.reduce((sum, doc) => sum + doc.pageContent.length, 0);
  const chunkSizes = documents.map(doc => doc.pageContent.length);

  return {
    totalDocuments: documents.length,
    totalCharacters,
    averageChunkSize: Math.round(totalCharacters / documents.length),
    minChunkSize: Math.min(...chunkSizes),
    maxChunkSize: Math.max(...chunkSizes),
  };
};
