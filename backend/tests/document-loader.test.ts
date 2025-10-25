import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { 
  loadPDF, 
  loadDOCX, 
  loadTXT, 
  loadDocument,
  chunkDocuments,
  loadAndProcessDocument,
  processUploadedFile,
  getDocumentStatistics,
  saveBufferToTempFile,
  deleteTempFile
} from '../src/services/ai/loaders/document.loader';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Document Loader Integration Tests
 * Tests the LangChain document loaders for PDF, DOCX, and TXT files
 */

describe('Document Loader Service', () => {
  const testFilesDir = path.join(__dirname, '../test-files');
  const sampleTxtPath = path.join(testFilesDir, 'sample-machine-learning.txt');

  beforeAll(() => {
    // Ensure test files directory exists
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }
  });

  describe('TXT File Loading', () => {
    test('should load TXT file successfully', async () => {
      const documents = await loadTXT(sampleTxtPath);
      
      expect(documents).toBeDefined();
      expect(Array.isArray(documents)).toBe(true);
      expect(documents.length).toBeGreaterThan(0);
      expect(documents[0].pageContent).toContain('Machine Learning');
    });

    test('should fail with invalid file path', async () => {
      await expect(loadTXT('/invalid/path/file.txt')).rejects.toThrow();
    });
  });

  describe('Document Chunking', () => {
    test('should chunk documents with default options', async () => {
      const documents = await loadTXT(sampleTxtPath);
      const chunks = await chunkDocuments(documents);

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThanOrEqual(documents.length);
      
      // Check that chunks have content
      chunks.forEach(chunk => {
        expect(chunk.pageContent.length).toBeGreaterThan(0);
        expect(chunk.pageContent.length).toBeLessThanOrEqual(600); // chunk size + some buffer
      });
    });

    test('should chunk with custom options', async () => {
      const documents = await loadTXT(sampleTxtPath);
      const chunks = await chunkDocuments(documents, {
        chunkSize: 200,
        chunkOverlap: 50,
      });

      expect(chunks).toBeDefined();
      expect(Array.isArray(chunks)).toBe(true);
      
      // Chunks should generally be smaller with smaller chunk size
      chunks.forEach(chunk => {
        expect(chunk.pageContent.length).toBeLessThanOrEqual(300);
      });
    });
  });

  describe('Complete Document Processing Pipeline', () => {
    test('should load and process TXT document', async () => {
      const result = await loadAndProcessDocument(sampleTxtPath, 'txt');

      expect(result).toBeDefined();
      expect(result.documents).toBeDefined();
      expect(result.metadata).toBeDefined();
      
      expect(result.metadata.sourceType).toBe('txt');
      expect(result.metadata.fileName).toContain('sample-machine-learning.txt');
      expect(result.metadata.totalChunks).toBeGreaterThan(0);
      expect(result.metadata.totalCharacters).toBeGreaterThan(0);

      // Check that metadata is added to chunks
      result.documents.forEach((doc, index) => {
        expect(doc.metadata.fileName).toBeDefined();
        expect(doc.metadata.fileType).toBe('txt');
        expect(doc.metadata.chunkIndex).toBe(index);
        expect(doc.metadata.totalChunks).toBe(result.metadata.totalChunks);
      });
    });

    test('should handle different file types', async () => {
      const txtResult = await loadAndProcessDocument(sampleTxtPath, 'txt');
      expect(txtResult.metadata.sourceType).toBe('txt');
    });
  });

  describe('Buffer Processing', () => {
    test('should save buffer to temp file', async () => {
      const testContent = 'This is a test file content';
      const buffer = Buffer.from(testContent, 'utf-8');
      
      const tempPath = await saveBufferToTempFile(buffer, 'test.txt');

      expect(tempPath).toBeDefined();
      expect(fs.existsSync(tempPath)).toBe(true);

      const fileContent = fs.readFileSync(tempPath, 'utf-8');
      expect(fileContent).toBe(testContent);

      // Clean up
      await deleteTempFile(tempPath);
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    test('should process uploaded file buffer', async () => {
      const fileContent = fs.readFileSync(sampleTxtPath);
      const buffer = Buffer.from(fileContent);

      const result = await processUploadedFile(
        buffer,
        'sample-test.txt',
        'txt'
      );

      expect(result).toBeDefined();
      expect(result.documents.length).toBeGreaterThan(0);
      expect(result.metadata.fileName).toBe('sample-test.txt');
      expect(result.metadata.sourceType).toBe('txt');
    });
  });

  describe('Document Statistics', () => {
    test('should calculate document statistics', async () => {
      const documents = await loadTXT(sampleTxtPath);
      const chunks = await chunkDocuments(documents);
      const stats = getDocumentStatistics(chunks);

      expect(stats.totalDocuments).toBe(chunks.length);
      expect(stats.totalCharacters).toBeGreaterThan(0);
      expect(stats.averageChunkSize).toBeGreaterThan(0);
      expect(stats.minChunkSize).toBeGreaterThan(0);
      expect(stats.maxChunkSize).toBeGreaterThanOrEqual(stats.minChunkSize);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid file type', async () => {
      await expect(loadDocument(sampleTxtPath, 'invalid' as any)).rejects.toThrow('Unsupported file type');
    });

    test('should handle missing file', async () => {
      await expect(loadTXT('/nonexistent/file.txt')).rejects.toThrow();
    });
  });
});
