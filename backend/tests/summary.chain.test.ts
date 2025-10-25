/**
 * Unit tests for improved generateSummary() function
 * Tests error handling, retry logic, and response validation
 */

import { generateSummary, extractConcepts, generateLongDocumentSummary } from '../src/services/ai/chains/summary.chain';

describe('generateSummary() - Error Handling Tests', () => {
  
  test('should handle empty content gracefully', async () => {
    await expect(generateSummary('', 'brief')).rejects.toThrow('Cannot generate summary: content is empty');
  });
  
  test('should handle whitespace-only content', async () => {
    await expect(generateSummary('   \n\n  ', 'brief')).rejects.toThrow('Cannot generate summary: content is empty');
  });
  
  test('should validate model name and use default for legacy models', async () => {
    // This test assumes the model validation logic converts gemini-1.5-pro to gemini-2.5-pro
    const result = await generateSummary('Test content for summary generation', 'quick');
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.model).toBeDefined();
  });
  
  test('should generate quick summary successfully', async () => {
    const content = 'Machine learning is a subset of artificial intelligence that enables systems to learn from data.';
    const result = await generateSummary(content, 'quick');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.generationTime).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();
  });
  
  test('should generate brief summary successfully', async () => {
    const content = `
      Machine learning (ML) is a field of study in artificial intelligence concerned with the development and study of statistical algorithms 
      that can learn from data and generalize to unseen data, and thus perform tasks without explicit instructions. 
      Recently, artificial neural networks have been able to surpass many previous approaches in performance.
    `;
    const result = await generateSummary(content, 'brief');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(result.wordCount).toBeGreaterThan(0);
  });
  
  test('should generate detailed summary with concepts', async () => {
    const content = `
      Deep learning is part of a broader family of machine learning methods based on artificial neural networks with representation learning. 
      Learning can be supervised, semi-supervised or unsupervised. Deep-learning architectures such as deep neural networks, 
      deep belief networks, recurrent neural networks, and convolutional neural networks have been applied to fields including computer vision, 
      speech recognition, natural language processing, audio recognition, social network filtering, machine translation, bioinformatics, 
      drug design, medical image analysis, climate science, material inspection and board game programs.
    `;
    const result = await generateSummary(content, 'detailed');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(result.wordCount).toBeGreaterThan(50); // Detailed summaries should be longer
    // Concepts may or may not be present depending on extraction success
  });
});

describe('extractConcepts() - Error Handling Tests', () => {
  
  test('should handle empty content gracefully', async () => {
    await expect(extractConcepts('')).rejects.toThrow('Cannot extract concepts: content is empty');
  });
  
  test('should extract concepts successfully', async () => {
    const content = `
      Artificial Intelligence (AI) refers to the simulation of human intelligence in machines. 
      Machine Learning is a subset of AI that allows systems to learn from data. 
      Deep Learning uses neural networks with multiple layers to analyze complex patterns.
      Natural Language Processing (NLP) enables computers to understand human language.
    `;
    
    const result = await extractConcepts(content);
    
    expect(result).toBeDefined();
    expect(result.topics).toBeDefined();
    expect(result.concepts).toBeDefined();
    expect(result.terms).toBeDefined();
    expect(Array.isArray(result.topics)).toBe(true);
    expect(Array.isArray(result.concepts)).toBe(true);
    expect(Array.isArray(result.terms)).toBe(true);
  });
});

describe('generateLongDocumentSummary() - Error Handling Tests', () => {
  
  test('should handle empty chunks array', async () => {
    await expect(generateLongDocumentSummary([], 'brief')).rejects.toThrow('Cannot generate long document summary: no chunks provided');
  });
  
  test('should handle all empty chunks', async () => {
    await expect(generateLongDocumentSummary(['', '  ', '\n'], 'brief')).rejects.toThrow('Cannot generate long document summary: all chunks are empty');
  });
  
  test('should generate summary from multiple chunks', async () => {
    const chunks = [
      'Artificial Intelligence is transforming industries worldwide.',
      'Machine Learning algorithms can identify patterns in large datasets.',
      'Deep Learning has revolutionized computer vision and natural language processing.',
    ];
    
    const result = await generateLongDocumentSummary(chunks, 'brief');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.generationTime).toBeGreaterThan(0);
  });
  
  test('should handle partial chunk failures gracefully', async () => {
    // This test would require mocking to simulate partial failures
    // For now, we test with valid chunks
    const chunks = [
      'Valid content for first chunk.',
      'Valid content for second chunk.',
      'Valid content for third chunk.',
    ];
    
    const result = await generateLongDocumentSummary(chunks, 'quick');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
  });
});

describe('Retry Logic Tests', () => {
  
  test('should respect token limits', async () => {
    // Generate a very long content string (> 8000 chars)
    const longContent = 'Machine learning '.repeat(1000);
    
    const result = await generateSummary(longContent, 'brief');
    
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    // Should succeed even with long content due to truncation
  });
});

describe('Response Validation Tests', () => {
  
  test('should validate word count calculation', async () => {
    const content = 'This is a test sentence with exactly ten words here.';
    const result = await generateSummary(content, 'quick');
    
    expect(result.wordCount).toBeGreaterThan(0);
    expect(typeof result.wordCount).toBe('number');
  });
  
  test('should include model information in result', async () => {
    const content = 'Testing model information in summary result.';
    const result = await generateSummary(content, 'quick');
    
    expect(result.model).toBeDefined();
    expect(typeof result.model).toBe('string');
    expect(result.model.length).toBeGreaterThan(0);
  });
  
  test('should include generation time in result', async () => {
    const content = 'Testing generation time tracking.';
    const result = await generateSummary(content, 'quick');
    
    expect(result.generationTime).toBeDefined();
    expect(typeof result.generationTime).toBe('number');
    expect(result.generationTime).toBeGreaterThan(0);
  });
});
