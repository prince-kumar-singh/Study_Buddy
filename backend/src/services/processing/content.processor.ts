import { Types } from 'mongoose';
import { Content } from '../../models/Content.model';
import { Transcript } from '../../models/Transcript.model';
import { Summary } from '../../models/Summary.model';
import { Flashcard } from '../../models/Flashcard.model';
import { logger } from '../../config/logger';
import { YoutubeTranscript } from 'youtube-transcript';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { getVectorStore } from '../ai/vectorstore/setup';
import { generateSummary } from '../ai/chains/summary.chain';
import { generateContentFlashcards } from '../ai/chains/flashcard.chain';
import { WebSocketService } from '../../config/websocket';

/**
 * Content Processor Service
 * Handles async processing of YouTube videos and documents through the AI pipeline
 * Pipeline: Transcription → Chunking/Embedding → Vectorization → Summary → Flashcards → Quizzes
 */
export class ContentProcessor {
  private wsService: WebSocketService;

  constructor(wsService: WebSocketService) {
    this.wsService = wsService;
  }

  /**
   * Process YouTube video through the complete AI pipeline
   */
  async processYouTubeContent(contentId: string, userId: string): Promise<void> {
    const objectId = new Types.ObjectId(contentId);
    
    try {
      logger.info(`Starting YouTube processing for content ${contentId}`);

      // Update status to processing
      await Content.findByIdAndUpdate(objectId, {
        status: 'processing',
        'processingStages.transcription.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'transcription', 10, 'Fetching YouTube transcript...');

      // Step 1: Fetch transcript using LangChain YoutubeLoader
      const content = await Content.findById(objectId);
      if (!content || !content.sourceUrl) {
        throw new Error('Content or source URL not found');
      }

      const transcript = await this.fetchYouTubeTranscript(content.sourceUrl, contentId, userId);
      
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.transcription.status': 'completed',
        'processingStages.transcription.progress': 100,
      });

      this.emitProgress(userId, contentId, 'transcription', 100, 'Transcript fetched successfully');

      // Step 2: Chunk and vectorize transcript
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.vectorization.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'vectorization', 10, 'Chunking and embedding transcript...');

      await this.vectorizeTranscript(transcript, contentId, userId);

      await Content.findByIdAndUpdate(objectId, {
        'processingStages.vectorization.status': 'completed',
        'processingStages.vectorization.progress': 100,
      });

      this.emitProgress(userId, contentId, 'vectorization', 100, 'Vectorization completed');

      // Step 3: Generate summaries
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.summarization.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'summarization', 10, 'Generating summaries...');

      await this.generateSummaries(transcript, contentId, userId);

      await Content.findByIdAndUpdate(objectId, {
        'processingStages.summarization.status': 'completed',
        'processingStages.summarization.progress': 100,
      });

      this.emitProgress(userId, contentId, 'summarization', 100, 'Summaries generated');

      // Step 4: Generate flashcards
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.flashcardGeneration.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'flashcardGeneration', 10, 'Generating flashcards...');

      await this.generateFlashcards(transcript, contentId, userId);

      await Content.findByIdAndUpdate(objectId, {
        'processingStages.flashcardGeneration.status': 'completed',
        'processingStages.flashcardGeneration.progress': 100,
      });

      this.emitProgress(userId, contentId, 'flashcardGeneration', 100, 'Flashcards generated');

      // Step 5: Generate quizzes (placeholder for now)
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.quizGeneration.status': 'completed',
        'processingStages.quizGeneration.progress': 100,
        status: 'completed',
      });

      this.emitProgress(userId, contentId, 'quizGeneration', 100, 'Processing completed!');

      logger.info(`Successfully completed processing for content ${contentId}`);
    } catch (error) {
      logger.error(`Processing failed for content ${contentId}:`, error);

      await Content.findByIdAndUpdate(objectId, {
        status: 'failed',
        'metadata.error': error instanceof Error ? error.message : 'Unknown error',
      });

      this.emitProgress(userId, contentId, 'error', 0, 'Processing failed');
      throw error;
    }
  }

  /**
   * Fetch YouTube transcript using youtube-transcript library
   */
  private async fetchYouTubeTranscript(
    videoUrl: string,
    contentId: string,
    userId: string
  ): Promise<any> {
    try {
      // Extract video ID from URL
      const videoId = this.extractYouTubeVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      logger.info(`Fetching transcript for video ${videoId}`);

      // Fetch transcript using youtube-transcript library
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);

      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript found for this video');
      }

      // Combine all transcript segments into full text
      const fullText = transcriptData.map(item => item.text).join(' ');

      // Create transcript segments with timestamps
      const segments = transcriptData.map(item => ({
        text: item.text,
        startTime: Math.floor(item.offset),
        endTime: Math.floor(item.offset + item.duration),
        speaker: 'Unknown',
        confidence: 1.0,
      }));

      // Calculate total duration
      const lastSegment = transcriptData[transcriptData.length - 1];
      const totalDuration = lastSegment ? Math.floor((lastSegment.offset + lastSegment.duration) / 1000) : 0;

      // Update content with video metadata
      await Content.findByIdAndUpdate(contentId, {
        'metadata.duration': totalDuration,
        'metadata.videoId': videoId,
      });

      // Create transcript document
      const transcript = new Transcript({
        contentId: new Types.ObjectId(contentId),
        userId: new Types.ObjectId(userId),
        fullText,
        segments,
        language: 'en',
        metadata: {
          source: 'youtube',
          videoId,
        },
      });

      await transcript.save();
      logger.info(`Transcript saved for content ${contentId}`);

      return transcript;
    } catch (error) {
      logger.error('YouTube transcript fetch failed:', error);
      throw new Error(`Failed to fetch YouTube transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract YouTube video ID from various URL formats
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Chunk transcript and store embeddings in vector database
   */
  private async vectorizeTranscript(
    transcript: any,
    contentId: string,
    userId: string
  ): Promise<void> {
    try {
      logger.info(`Vectorizing transcript for content ${contentId}`);

      // Split transcript into chunks (500 tokens, 100 overlap as per specs)
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });

      const chunks = await textSplitter.splitText(transcript.fullText);

      this.emitProgress(userId, contentId, 'vectorization', 30, `Split into ${chunks.length} chunks`);

      // Generate embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY!,
        modelName: 'embedding-001',
      });

      this.emitProgress(userId, contentId, 'vectorization', 50, 'Generating embeddings...');

      // Store in vector database with metadata
      const documents = chunks.map((chunk, index) => ({
        pageContent: chunk,
        metadata: {
          contentId,
          userId,
          chunkIndex: index,
          source: 'youtube',
          videoId: transcript.metadata?.videoId || '',
          // Approximate timestamps based on chunk position
          startTime: Math.floor((index / chunks.length) * (transcript.segments[0]?.endTime || 0)),
          endTime: Math.floor(((index + 1) / chunks.length) * (transcript.segments[0]?.endTime || 0)),
        },
      }));

      // Add to vector store
      const store = getVectorStore();
      await store.addDocuments(documents);

      this.emitProgress(userId, contentId, 'vectorization', 90, 'Stored in vector database');

      logger.info(`Vectorization completed for content ${contentId}`);
    } catch (error) {
      logger.error('Vectorization failed:', error);
      throw new Error(`Vectorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate summaries at different levels
   */
  private async generateSummaries(
    transcript: any,
    contentId: string,
    userId: string
  ): Promise<void> {
    try {
      logger.info(`Generating summaries for content ${contentId}`);

      const levels = ['quick', 'brief', 'detailed'] as const;

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        this.emitProgress(
          userId,
          contentId,
          'summarization',
          20 + (i * 25),
          `Generating ${level} summary...`
        );

        const summaryResult = await generateSummary(transcript.fullText, level);
        const summaryText = summaryResult.content;

        const summary = new Summary({
          contentId: new Types.ObjectId(contentId),
          userId: new Types.ObjectId(userId),
          level,
          text: summaryText,
          wordCount: summaryText.split(/\s+/).length,
          keyPoints: [], // TODO: Extract key points from summary
          sourceSegments: [
            {
              startTime: transcript.segments[0]?.startTime || 0,
              endTime: transcript.segments[0]?.endTime || 0,
            },
          ],
        });

        await summary.save();
        logger.info(`${level} summary generated for content ${contentId}`);
      }
    } catch (error) {
      logger.error('Summary generation failed:', error);
      throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate flashcards from transcript
   */
  private async generateFlashcards(
    transcript: any,
    contentId: string,
    userId: string
  ): Promise<void> {
    try {
      logger.info(`Generating flashcards for content ${contentId}`);

      this.emitProgress(userId, contentId, 'flashcardGeneration', 30, 'Analyzing content...');

      // Prepare segments from transcript
      const segments = transcript.segments.map((seg: any) => ({
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
      }));

      const result = await generateContentFlashcards(segments, 30);

      // Save flashcards to database
      const flashcardDocs = result.flashcards.map((card) => ({
        contentId: new Types.ObjectId(contentId),
        userId: new Types.ObjectId(userId),
        type: card.type,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        sourceSegment: card.sourceTimestamp,
        tags: card.tags || [],
      }));

      await Flashcard.insertMany(flashcardDocs);

      this.emitProgress(userId, contentId, 'flashcardGeneration', 80, `Generated ${result.flashcards.length} flashcards`);

      logger.info(`Generated ${result.flashcards.length} flashcards for content ${contentId}`);
    } catch (error) {
      logger.error('Flashcard generation failed:', error);
      throw new Error(`Flashcard generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Emit progress update via WebSocket
   */
  private emitProgress(
    userId: string,
    contentId: string,
    stage: string,
    progress: number,
    message: string
  ): void {
    this.wsService.sendToUser(userId, {
      type: 'processing_progress',
      data: {
        contentId,
        stage,
        progress,
        message,
      },
    });
  }
}
