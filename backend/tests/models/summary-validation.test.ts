/**
 * Test Suite for Summary Validation Fix
 * 
 * This test verifies that the Summary model validation works correctly
 * with the fixed field names and structure.
 */

import mongoose from 'mongoose';
import { Summary } from '../../src/models/Summary.model';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('Summary Model Validation Fix', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Summary.deleteMany({});
  });

  describe('Successful Summary Creation', () => {
    it('should create a quick summary with correct schema fields', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'quick',
        content: 'This is a quick summary of the content.',
        keyPoints: ['Point 1', 'Point 2'],
        topics: ['Topic 1'],
        metadata: {
          wordCount: 8,
          generationTime: 1500,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      const saved = await summary.save();

      expect(saved._id).toBeDefined();
      expect(saved.type).toBe('quick');
      expect(saved.content).toBe('This is a quick summary of the content.');
      expect(saved.metadata.wordCount).toBe(8);
      expect(saved.metadata.model).toBe('gemini-pro');
    });

    it('should create a brief summary', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'brief',
        content: 'This is a brief summary with more detail about the content.',
        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
        topics: ['Machine Learning', 'Data Science'],
        metadata: {
          wordCount: 12,
          generationTime: 2000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      const saved = await summary.save();

      expect(saved.type).toBe('brief');
      expect(saved.topics).toHaveLength(2);
      expect(saved.keyPoints).toHaveLength(3);
    });

    it('should create a detailed summary', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'detailed',
        content: 'This is a very detailed summary with comprehensive information about the content, including background context, main ideas, supporting details, and conclusions.',
        keyPoints: ['Point 1', 'Point 2', 'Point 3', 'Point 4', 'Point 5'],
        topics: ['Topic A', 'Topic B', 'Topic C'],
        metadata: {
          wordCount: 25,
          generationTime: 3500,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      const saved = await summary.save();

      expect(saved.type).toBe('detailed');
      expect(saved.content).toContain('comprehensive information');
      expect(saved.metadata.generationTime).toBe(3500);
    });

    it('should allow empty keyPoints and topics arrays', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'quick',
        content: 'Simple summary',
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 2,
          generationTime: 800,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      const saved = await summary.save();

      expect(saved.keyPoints).toEqual([]);
      expect(saved.topics).toEqual([]);
    });
  });

  describe('Validation Errors', () => {
    it('should fail when type is missing', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        // type is missing
        content: 'This is a summary.',
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 4,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      
      await expect(summary.save()).rejects.toThrow(/type.*required/i);
    });

    it('should fail when content is missing', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'brief',
        // content is missing
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 0,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      
      await expect(summary.save()).rejects.toThrow(/content.*required/i);
    });

    it('should fail when both type and content are missing', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        // type is missing
        // content is missing
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 0,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      
      await expect(summary.save()).rejects.toThrow(/validation failed/i);
    });

    it('should fail with invalid type enum value', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'invalid-type', // Invalid enum value
        content: 'This is a summary.',
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 4,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData as any);
      
      await expect(summary.save()).rejects.toThrow();
    });

    it('should fail when contentId is missing', async () => {
      const summaryData = {
        // contentId is missing
        type: 'brief',
        content: 'This is a summary.',
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 4,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData);
      
      await expect(summary.save()).rejects.toThrow(/contentId.*required/i);
    });
  });

  describe('Old Field Names (Should Not Work)', () => {
    it('should NOT accept old field name "level" instead of "type"', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        level: 'brief', // Old field name
        content: 'This is a summary.',
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 4,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData as any);
      
      // Should fail because 'level' is not recognized, so 'type' is missing
      await expect(summary.save()).rejects.toThrow(/type.*required/i);
    });

    it('should NOT accept old field name "text" instead of "content"', async () => {
      const summaryData = {
        contentId: new mongoose.Types.ObjectId(),
        type: 'brief',
        text: 'This is a summary.', // Old field name
        keyPoints: [],
        topics: [],
        metadata: {
          wordCount: 4,
          generationTime: 1000,
          model: 'gemini-pro',
        },
      };

      const summary = new Summary(summaryData as any);
      
      // Should fail because 'text' is not recognized, so 'content' is missing
      await expect(summary.save()).rejects.toThrow(/content.*required/i);
    });
  });

  describe('Schema Field Verification', () => {
    it('should have correct schema structure', () => {
      const schema = Summary.schema.obj;

      // Verify new field names exist
      expect(schema).toHaveProperty('type');
      expect(schema).toHaveProperty('content');
      expect(schema).toHaveProperty('metadata');

      // Verify type is an enum
      expect((schema as any).type.enum).toEqual(['quick', 'brief', 'detailed']);

      // Verify required fields
      expect((schema as any).type.required).toBe(true);
      expect((schema as any).content.required).toBe(true);
      expect((schema as any).contentId.required).toBe(true);
    });
  });
});
