import { Types } from 'mongoose';
import { Content } from '../../models/Content.model';
import { Transcript } from '../../models/Transcript.model';
import { Summary } from '../../models/Summary.model';
import { Flashcard } from '../../models/Flashcard.model';
import { Quiz } from '../../models/Quiz.model';
import { logger } from '../../config/logger';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { getVectorStore } from '../ai/vectorstore/setup';
import { generateSummary } from '../ai/chains/summary.chain';
import { generateContentFlashcards } from '../ai/chains/flashcard.chain';
import { generateQuizWithFallback } from '../ai/chains/quiz.chain';
import { WebSocketService } from '../../config/websocket';
import {
  isQuotaError,
  parseQuotaError,
  QuotaExceededError,
  logQuotaError,
  shouldRetryQuotaError,
  formatQuotaErrorMessage,
  calculateQuotaBackoffDelay,
} from '../../utils/quota-error-handler';

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

  // Removed legacy YouTube fetch pipeline. Only user-provided transcript/document flows remain.



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

        try {
          const summaryResult = await generateSummary(transcript.fullText, level, userId, contentId);
          const summaryText = summaryResult.content;
          const wordCount = summaryText.split(/\s+/).length;

          // Create summary with correct schema fields
          const summary = new Summary({
            contentId: new Types.ObjectId(contentId),
            type: level,                           // Correct field name (not 'level')
            content: summaryText,                  // Correct field name (not 'text')
            keyPoints: summaryResult.concepts?.concepts || [],
            topics: summaryResult.concepts?.topics || [],
            metadata: {                            // Nested metadata structure
              wordCount,
              generationTime: summaryResult.generationTime || 0,
              model: summaryResult.model,
            },
          });

          await summary.save();
          logger.info(`${level} summary generated for content ${contentId}`);
        } catch (error) {
          // Check if this is a quota error
          if (error instanceof QuotaExceededError) {
            logger.error(`Quota exceeded while generating ${level} summary for content ${contentId}`);
            
            // Update content status to paused
            await Content.findByIdAndUpdate(new Types.ObjectId(contentId), {
              status: 'paused',
              'processingStages.summarization.status': 'paused',
              'processingStages.summarization.error': 'quota_exceeded',
              'processingStages.summarization.errorDetails': {
                quotaInfo: error.quotaInfo,
                pausedAt: new Date(),
                message: 'API quota limit reached. Processing paused.',
              },
            });

            // Notify user with detailed quota information
            this.emitProgress(
              userId,
              contentId,
              'error',
              0,
              `⚠️ Processing paused: ${formatQuotaErrorMessage(error.quotaInfo)}\n\nYou can resume processing once your quota is restored.`
            );

            // Re-throw to stop further processing
            throw error;
          }
          
          // Add better error logging for validation errors
          if (error instanceof Error && error.name === 'ValidationError') {
            logger.error(`Summary validation failed for ${level} summary:`, {
              contentId,
              level,
              validationErrors: (error as any).errors,
              message: error.message,
            });
          }
          
          // For other errors, let them propagate
          throw error;
        }
      }
    } catch (error) {
      // If it's a quota error, it's already handled above
      if (error instanceof QuotaExceededError) {
        throw error;
      }
      
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
      // Check if this is a quota error
      if (error instanceof QuotaExceededError) {
        logger.error(`Quota exceeded while generating flashcards for content ${contentId}`);
        
        // Update content status to paused
        await Content.findByIdAndUpdate(new Types.ObjectId(contentId), {
          status: 'paused',
          'processingStages.flashcardGeneration.status': 'paused',
          'processingStages.flashcardGeneration.error': 'quota_exceeded',
          'processingStages.flashcardGeneration.errorDetails': {
            quotaInfo: error.quotaInfo,
            pausedAt: new Date(),
            message: 'API quota limit reached. Processing paused.',
          },
        });

        // Notify user with detailed quota information
        this.emitProgress(
          userId,
          contentId,
          'error',
          0,
          `⚠️ Processing paused: ${formatQuotaErrorMessage(error.quotaInfo)}\n\nYou can resume processing once your quota is restored.`
        );

        // Re-throw to stop further processing
        throw error;
      }
      
      logger.error('Flashcard generation failed:', error);
      throw new Error(`Flashcard generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate quizzes from transcript with retry logic
   */
  private async generateQuizzes(
    transcript: any,
    contentId: string,
    userId: string
  ): Promise<void> {
    const maxRetries = 3;
    let attempts = 0;
    let lastError: Error | null = null;

    try {
      logger.info(`Generating quizzes for content ${contentId}`);

      this.emitProgress(userId, contentId, 'quizGeneration', 20, 'Analyzing content for quiz generation...');

      // Combine all transcript segments for quiz generation
      const fullTranscript = transcript.segments.map((seg: any) => seg.text).join(' ');
      const startTime = transcript.segments[0].startTime;
      const endTime = transcript.segments[transcript.segments.length - 1].endTime;

      // Try generating quizzes with different difficulty levels with retry
      // Generate all three difficulty levels to ensure users have all options
      const difficulties: ('beginner' | 'intermediate' | 'advanced')[] = ['beginner', 'intermediate', 'advanced'];
      const successfulQuizzes: string[] = [];
      
      for (const difficulty of difficulties) {
        attempts = 0;
        let quizGenerated = false;
        
        while (attempts < maxRetries) {
          attempts++;
          
          try {
            this.emitProgress(
              userId, 
              contentId, 
              'quizGeneration', 
              30 + (difficulties.indexOf(difficulty) * 20), 
              `Generating ${difficulty} quiz (attempt ${attempts}/${maxRetries})...`
            );

            // Check if quiz already exists (avoid duplicates from concurrent processing)
            const existingQuiz = await Quiz.findOne({
              contentId: new Types.ObjectId(contentId),
              userId: new Types.ObjectId(userId),
              difficulty,
              isActive: true,
            });

            if (existingQuiz) {
              logger.info(`${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} quiz already exists, skipping generation`);
              successfulQuizzes.push(difficulty);
              quizGenerated = true;
              break; // Exit retry loop for this difficulty
            }

            // Generate quiz using LangChain
            const quizResult = await generateQuizWithFallback(
              fullTranscript,
              startTime,
              endTime,
              difficulty
            );

            // Get content for title
            const content = await Content.findById(new Types.ObjectId(contentId));
            
            // Create and save quiz document with version tracking
            const quiz = new Quiz({
              contentId: new Types.ObjectId(contentId),
              userId: new Types.ObjectId(userId),
              title: quizResult.title || `${content?.title || 'Content'} - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Quiz`,
              description: quizResult.description || `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} level quiz generated automatically`,
              questions: quizResult.questions,
              difficulty,
              totalPoints: quizResult.questions.reduce((sum, q) => sum + q.points, 0),
              passingScore: 70,
              timeLimit: quizResult.estimatedDuration,
              metadata: {
                generationTime: quizResult.generationTime,
                model: quizResult.model,
                topicsCovered: quizResult.topicsCovered,
                estimatedDuration: quizResult.estimatedDuration,
              },
              version: 1,
              generationMethod: 'auto',
              generationAttempts: attempts,
              isActive: true,
            });

            await quiz.save();
            
            logger.info(`Generated ${difficulty} quiz ${quiz._id} for content ${contentId} (${quizResult.questions.length} questions)`);
            
            this.emitProgress(
              userId, 
              contentId, 
              'quizGeneration', 
              40 + (difficulties.indexOf(difficulty) * 20), 
              `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} quiz created with ${quizResult.questions.length} questions`
            );
            
            // Mark success
            successfulQuizzes.push(difficulty);
            quizGenerated = true;
            
            // Success, break retry loop
            break;
          } catch (error) {
            lastError = error as Error;
            
            // Ensure error message is properly stringified for logging
            const errorMessage = error instanceof Error 
              ? error.message 
              : typeof error === 'string' 
                ? error 
                : JSON.stringify(error);
            
            // Check if this is a quota error
            if (error instanceof QuotaExceededError) {
              logger.error(`Quota exceeded while generating ${difficulty} quiz for content ${contentId}`);
              
              // Update content status to paused
              await Content.findByIdAndUpdate(new Types.ObjectId(contentId), {
                status: 'paused',
                'processingStages.quizGeneration.status': 'paused',
                'processingStages.quizGeneration.error': 'quota_exceeded',
                'processingStages.quizGeneration.errorDetails': {
                  quotaInfo: error.quotaInfo,
                  pausedAt: new Date(),
                  message: 'API quota limit reached. Processing paused.',
                  attemptedDifficulty: difficulty,
                  failedAttempts: attempts,
                },
              });

              // Notify user
              this.emitProgress(
                userId,
                contentId,
                'error',
                0,
                `⚠️ Processing paused: ${formatQuotaErrorMessage(error.quotaInfo)}\n\nYou can resume processing once your quota is restored.`
              );

              // Re-throw to stop further processing
              throw error;
            }
            
            logger.warn(`Quiz generation attempt ${attempts}/${maxRetries} failed for ${difficulty} level: ${errorMessage}`);
            
            if (attempts >= maxRetries) {
              logger.error(`Failed to generate ${difficulty} quiz after ${maxRetries} attempts: ${errorMessage}`);
              // Don't break - try next difficulty level
            }
            
            // Wait before retry (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        // Log if this difficulty level failed completely
        if (!quizGenerated) {
          logger.warn(`Failed to generate ${difficulty} quiz after all attempts, continuing with other difficulty levels`);
        }
      }

      // Verify at least one quiz was created
      const quizCount = successfulQuizzes.length;

      if (quizCount === 0) {
        throw new Error('Failed to generate any quizzes. All difficulty levels failed.');
      }

      this.emitProgress(
        userId, 
        contentId, 
        'quizGeneration', 
        100, 
        `Successfully generated ${quizCount} quiz${quizCount > 1 ? 'zes' : ''} (${successfulQuizzes.join(', ')})`
      );

      logger.info(`Successfully generated ${quizCount} quiz(zes) for content ${contentId}: ${successfulQuizzes.join(', ')}`);
    } catch (error) {
      // If it's a quota error, it was already handled above
      if (error instanceof QuotaExceededError) {
        throw error;
      }
      
      logger.error('Quiz generation failed:', error);
      
      // Mark the stage as failed but don't fail the entire processing
      await Content.findByIdAndUpdate(new Types.ObjectId(contentId), {
        'processingStages.quizGeneration.status': 'failed',
        'processingStages.quizGeneration.error': error instanceof Error ? error.message : 'Unknown error',
        'processingStages.quizGeneration.errorDetails': {
          attempts: attempts,
          lastError: lastError?.message || 'Unknown error',
        },
      });
      
      // Log but don't throw - allow processing to complete without quizzes
      logger.warn(`Quiz generation failed for content ${contentId}, but continuing processing`);
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

  /**
   * Process document content through the complete AI pipeline
   * Pipeline: Document Loading (already done) → Transcript Creation → Vectorization → Summary → Flashcards → Quizzes
   */
  async processDocumentContent(contentId: string, userId: string, documents: any[]): Promise<void> {
    const objectId = new Types.ObjectId(contentId);
    
    try {
      logger.info(`Starting document processing for content ${contentId} with ${documents.length} chunks`);

      // Update status to processing
      await Content.findByIdAndUpdate(objectId, {
        status: 'processing',
      });

      // Step 1: Create transcript from document chunks
      this.emitProgress(userId, contentId, 'transcription', 50, 'Creating document transcript...');

      const transcript = await this.createDocumentTranscript(documents, contentId, userId);

      this.emitProgress(userId, contentId, 'transcription', 100, 'Document transcript created successfully');

      // Step 2: Vectorize document chunks
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.vectorization.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'vectorization', 10, 'Embedding document chunks...');

      await this.vectorizeDocuments(documents, contentId, userId);

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

      // Step 5: Complete processing (quizzes placeholder for now)
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.quizGeneration.status': 'completed',
        'processingStages.quizGeneration.progress': 100,
        status: 'completed',
      });

      this.emitProgress(userId, contentId, 'quizGeneration', 100, 'Processing completed!');

      logger.info(`Successfully completed document processing for content ${contentId}`);
    } catch (error) {
      // Special handling for quota errors - pause instead of fail
      if (error instanceof QuotaExceededError) {
        logger.warn(`Processing paused for content ${contentId} due to quota limit`);
        
        await Content.findByIdAndUpdate(objectId, {
          status: 'paused',
          'metadata.pausedReason': 'quota_exceeded',
          'metadata.pausedAt': new Date(),
          'metadata.quotaInfo': error.quotaInfo,
        });

        // User already notified in generateSummaries, so just log here
        return;
      }
      
      logger.error(`Document processing failed for content ${contentId}:`, error);

      await Content.findByIdAndUpdate(objectId, {
        status: 'failed',
        'metadata.error': error instanceof Error ? error.message : 'Unknown error',
      });

      this.emitProgress(userId, contentId, 'error', 0, 'Processing failed');
      throw error;
    }
  }

  /**
   * Create transcript document from document chunks
   * Converts LangChain Document chunks into Transcript format
   */
  private async createDocumentTranscript(
    documents: any[],
    contentId: string,
    userId: string
  ): Promise<any> {
    try {
      logger.info(`Creating transcript from ${documents.length} document chunks`);

      // Combine all chunks into full text
      const fullText = documents.map(doc => doc.pageContent).join('\n\n');

      // Create segments from chunks (without timestamps for documents)
      const segments = documents.map((doc, index) => ({
        text: doc.pageContent,
        startTime: index * 1000, // Pseudo timestamps for chunk ordering
        endTime: (index + 1) * 1000,
        speaker: 'Document',
        confidence: 1.0,
        metadata: {
          chunkIndex: doc.metadata?.chunkIndex || index,
          page: doc.metadata?.loc?.pageNumber,
          fileName: doc.metadata?.fileName,
        },
      }));

      // Get content to extract metadata
      const content = await Content.findById(contentId);
      const fileName = content?.metadata?.fileName || 'document';
      const fileType = content?.type || 'pdf';

      // Create transcript document
      const transcript = new Transcript({
        contentId: new Types.ObjectId(contentId),
        userId: new Types.ObjectId(userId),
        fullText,
        segments,
        language: 'en',
        metadata: {
          source: 'document',
          fileType,
          fileName,
          totalChunks: documents.length,
        },
      });

      await transcript.save();
      logger.info(`Transcript created for document content ${contentId}`);

      return transcript;
    } catch (error) {
      logger.error('Document transcript creation failed:', error);
      throw new Error(`Failed to create document transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Vectorize document chunks and store in vector database
   */
  private async vectorizeDocuments(
    documents: any[],
    contentId: string,
    userId: string
  ): Promise<void> {
    try {
      logger.info(`Vectorizing ${documents.length} document chunks`);

      // Add contentId and userId to metadata for filtering during retrieval
      const documentsWithMetadata = documents.map((doc: any) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          contentId,
          userId,
          source: 'document',
        },
      }));

      // Store in vector database
      const vectorStore = await getVectorStore();
      await vectorStore.addDocuments(documentsWithMetadata);

      logger.info(`Vectorization completed for ${documents.length} document chunks`);
    } catch (error) {
      logger.error('Document vectorization failed:', error);
      throw new Error(`Failed to vectorize documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process YouTube transcript content through the complete AI pipeline
   * Pipeline: Transcript Processing → Vectorization → Summary → Flashcards → Quizzes
   */
  async processYouTubeTranscriptContent(
    contentId: string,
    userId: string,
    transcriptText: string,
    options: {
      title?: string;
      author?: string;
      duration?: string;
      language?: string;
    } = {}
  ): Promise<void> {
    const objectId = new Types.ObjectId(contentId);

    try {
      logger.info(`Starting YouTube transcript processing for content ${contentId} (${transcriptText.length} characters)`);

      // Update status to processing
      await Content.findByIdAndUpdate(objectId, {
        status: 'processing',
        'processingStages.transcription.status': 'completed', // Already provided
        'processingStages.transcription.progress': 100,
      });

      this.emitProgress(userId, contentId, 'transcription', 100, 'Transcript provided by user');

      // Step 1: Create transcript from provided text
      this.emitProgress(userId, contentId, 'transcription', 50, 'Processing transcript text...');

      const transcript = await this.createTranscriptFromText(transcriptText, contentId, userId, options);

      // Step 2: Vectorize transcript chunks
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

      // Step 5: Generate quizzes
      await Content.findByIdAndUpdate(objectId, {
        'processingStages.quizGeneration.status': 'processing',
      });

      this.emitProgress(userId, contentId, 'quizGeneration', 10, 'Generating quizzes...');

      await this.generateQuizzes(transcript, contentId, userId);

      await Content.findByIdAndUpdate(objectId, {
        'processingStages.quizGeneration.status': 'completed',
        'processingStages.quizGeneration.progress': 100,
        status: 'completed',
      });

      this.emitProgress(userId, contentId, 'quizGeneration', 100, 'Processing completed!');

      logger.info(`Successfully completed YouTube transcript processing for content ${contentId}`);
    } catch (error) {
      // Special handling for quota errors - pause instead of fail
      if (error instanceof QuotaExceededError) {
        logger.warn(`Processing paused for content ${contentId} due to quota limit`);

        await Content.findByIdAndUpdate(objectId, {
          status: 'paused',
          'metadata.pausedReason': 'quota_exceeded',
          'metadata.pausedAt': new Date(),
          'metadata.quotaInfo': error.quotaInfo,
        });

        // User already notified in generateSummaries, so just log here
        return;
      }

      logger.error(`YouTube transcript processing failed for content ${contentId}:`, error);

      await Content.findByIdAndUpdate(objectId, {
        status: 'failed',
        'metadata.error': error instanceof Error ? error.message : 'Unknown error',
      });

      this.emitProgress(userId, contentId, 'error', 0, 'Processing failed');
      throw error;
    }
  }

  /**
   * Create transcript document from provided text
   */
  private async createTranscriptFromText(
    transcriptText: string,
    contentId: string,
    userId: string,
    options: {
      title?: string;
      author?: string;
      duration?: string;
      language?: string;
    } = {}
  ): Promise<any> {
    try {
      logger.info(`Creating transcript from provided text (${transcriptText.length} characters)`);

      // Split text into chunks for processing (similar to document processing)
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000, // Larger chunks for transcript text
        chunkOverlap: 200,
      });

      const chunks = await textSplitter.splitText(transcriptText);

      // Create segments from chunks (without timestamps for user-provided transcripts)
      const segments = chunks.map((chunk, index) => ({
        text: chunk,
        startTime: index * 1000, // Pseudo timestamps for chunk ordering
        endTime: (index + 1) * 1000,
        speaker: 'Transcript',
        confidence: 1.0,
        metadata: {
          chunkIndex: index,
          source: 'user-provided',
        },
      }));

      // Create transcript document
      const transcript = new Transcript({
        contentId: new Types.ObjectId(contentId),
        userId: new Types.ObjectId(userId),
        fullText: transcriptText,
        segments,
        language: options.language || 'en',
        metadata: {
          source: 'user-provided-transcript',
          title: options.title,
          author: options.author,
          duration: options.duration,
          totalChunks: chunks.length,
          transcriptLength: transcriptText.length,
        },
      });

      await transcript.save();
      logger.info(`Transcript created from user-provided text for content ${contentId}`);

      return transcript;
    } catch (error) {
      logger.error('Transcript creation from text failed:', error);
      throw new Error(`Failed to create transcript from text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Resume processing from a paused state (e.g., after quota restoration)
   * TODO: Implement resume logic that picks up from where processing stopped
   */
  async resumeProcessing(contentId: string, userId: string, fromStage?: string): Promise<void> {
    logger.info(`Resume processing requested for content ${contentId}`);

    const content = await Content.findById(new Types.ObjectId(contentId));
    if (!content) {
      throw new Error('Content not found');
    }

    // Check if content is paused
    if (content.status !== 'paused') {
      throw new Error('Content is not in paused state');
    }

    // Resume using the same path as documents/transcripts (transcript must already exist)
    await this.resumeDocumentProcessing(contentId, userId);
  }

  /**
   * Resume document processing from the paused state
   */
  private async resumeDocumentProcessing(contentId: string, userId: string): Promise<void> {
    const objectId = new Types.ObjectId(contentId);
    
    try {
      logger.info(`Resuming document processing for content ${contentId}`);

      const content = await Content.findById(objectId);
      if (!content) {
        throw new Error('Content not found');
      }

      // Retrieve existing transcript
      const transcript = await Transcript.findOne({ contentId: objectId });
      if (!transcript) {
        throw new Error('Transcript not found - cannot resume processing');
      }

      // Update status to processing
      await Content.findByIdAndUpdate(objectId, {
        status: 'processing',
        'metadata.pausedReason': undefined,
        'metadata.pausedAt': undefined,
      });

      const stages = content.processingStages;
      
      // Resume from the appropriate stage
      
      // Check transcription stage (should be completed for documents)
      if (stages.transcription.status !== 'completed') {
        this.emitProgress(userId, contentId, 'transcription', 100, 'Transcript already exists');
        await Content.findByIdAndUpdate(objectId, {
          'processingStages.transcription.status': 'completed',
          'processingStages.transcription.progress': 100,
        });
      }

      // Check vectorization stage
      if (stages.vectorization.status !== 'completed') {
        await Content.findByIdAndUpdate(objectId, {
          'processingStages.vectorization.status': 'processing',
        });

        this.emitProgress(userId, contentId, 'vectorization', 10, 'Resuming vectorization...');

        // Re-vectorize the transcript
        await this.vectorizeTranscript(transcript, contentId, userId);

        await Content.findByIdAndUpdate(objectId, {
          'processingStages.vectorization.status': 'completed',
          'processingStages.vectorization.progress': 100,
        });

        this.emitProgress(userId, contentId, 'vectorization', 100, 'Vectorization completed');
      }

      // Check summarization stage
      if (stages.summarization.status !== 'completed') {
        await Content.findByIdAndUpdate(objectId, {
          'processingStages.summarization.status': 'processing',
        });

        this.emitProgress(userId, contentId, 'summarization', 10, 'Resuming summary generation...');

        await this.generateSummaries(transcript, contentId, userId);

        await Content.findByIdAndUpdate(objectId, {
          'processingStages.summarization.status': 'completed',
          'processingStages.summarization.progress': 100,
        });

        this.emitProgress(userId, contentId, 'summarization', 100, 'Summaries generated');
      }

      // Check flashcard generation stage
      if (stages.flashcardGeneration.status !== 'completed') {
        await Content.findByIdAndUpdate(objectId, {
          'processingStages.flashcardGeneration.status': 'processing',
        });

        this.emitProgress(userId, contentId, 'flashcardGeneration', 10, 'Resuming flashcard generation...');

        await this.generateFlashcards(transcript, contentId, userId);

        await Content.findByIdAndUpdate(objectId, {
          'processingStages.flashcardGeneration.status': 'completed',
          'processingStages.flashcardGeneration.progress': 100,
        });

        this.emitProgress(userId, contentId, 'flashcardGeneration', 100, 'Flashcards generated');
      }

      // Check quiz generation stage (currently a placeholder)
      if (stages.quizGeneration.status !== 'completed') {
        await Content.findByIdAndUpdate(objectId, {
          'processingStages.quizGeneration.status': 'processing',
        });

        this.emitProgress(userId, contentId, 'quizGeneration', 10, 'Resuming quiz generation...');

        await this.generateQuizzes(transcript, contentId, userId);

        await Content.findByIdAndUpdate(objectId, {
          'processingStages.quizGeneration.status': 'completed',
          'processingStages.quizGeneration.progress': 100,
        });

        this.emitProgress(userId, contentId, 'quizGeneration', 100, 'Quizzes generated');
      }

      // Mark processing as completed
      await Content.findByIdAndUpdate(objectId, {
        status: 'completed',
      });

      this.emitProgress(userId, contentId, 'completed', 100, 'Processing resumed and completed!');

      logger.info(`Successfully resumed and completed document processing for content ${contentId}`);
    } catch (error) {
      // Special handling for quota errors - pause instead of fail
      if (error instanceof QuotaExceededError) {
        logger.warn(`Processing paused again for content ${contentId} due to quota limit`);
        
        await Content.findByIdAndUpdate(objectId, {
          status: 'paused',
          'metadata.pausedReason': 'quota_exceeded',
          'metadata.pausedAt': new Date(),
          'metadata.quotaInfo': error.quotaInfo,
        });

        // User already notified in the generation methods
        return;
      }
      
      logger.error(`Resume document processing failed for content ${contentId}:`, error);

      await Content.findByIdAndUpdate(objectId, {
        status: 'failed',
        'metadata.error': error instanceof Error ? error.message : 'Unknown error',
      });

      this.emitProgress(userId, contentId, 'error', 0, 'Resume processing failed');
      throw error;
    }
  }
}
