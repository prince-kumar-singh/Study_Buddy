import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set LangChain callbacks to background mode to avoid latency warnings
// This should be set before any LangChain imports are used
if (process.env.LANGCHAIN_TRACING_V2 === 'true' && !process.env.LANGCHAIN_CALLBACKS_BACKGROUND) {
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'true';
}

// Import configurations
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';
import { initializeVectorStore } from './services/ai/vectorstore/setup';

// Import routes
import authRoutes from './routes/auth.routes';
import contentRoutes from './routes/content.routes';
import flashcardRoutes from './routes/flashcard.routes';
import quizRoutes from './routes/quiz.routes';
import qaRoutes from './routes/qa.routes';
import chatSessionRoutes from './routes/chat-session.routes';
import analyticsRoutes from './routes/analytics.routes';
import processingRoutes from './routes/processing.routes';
import quotaRoutes from './routes/quota.routes';
import adminConsistencyRoutes from './routes/admin-consistency.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { rateLimiter } from './middleware/rateLimit.middleware';

// Import WebSocket handler
import { initializeWebSocket } from './config/websocket';

// Import scheduled jobs
import { scheduledJobsService } from './services/jobs/scheduled-jobs.service';

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// Initialize WebSocket
initializeWebSocket(io);

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression()); // Compress responses
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Rate limiting
app.use('/api', rateLimiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contents', contentRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/chat-sessions', chatSessionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/quota', quotaRoutes);
app.use('/api/admin/consistency', adminConsistencyRoutes);

// API Documentation
app.get('/api-docs', (_req: Request, res: Response) => {
  res.json({
    message: 'Study Buddy API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user',
        'POST /api/auth/logout': 'Logout user',
        'GET /api/auth/me': 'Get current user',
      },
      contents: {
        'POST /api/contents/upload-youtube': 'Upload YouTube video',
        'POST /api/contents/upload-document': 'Upload document',
        'GET /api/contents': 'Get all user contents',
        'GET /api/contents/:id': 'Get content by ID',
        'GET /api/contents/:id/summaries': 'Get summaries for content',
        'DELETE /api/contents/:id': 'Delete content',
      },
      flashcards: {
        'GET /api/flashcards/:contentId': 'Get flashcards for content',
        'PUT /api/flashcards/:id/review': 'Update flashcard review',
        'GET /api/flashcards/due': 'Get due flashcards',
      },
      quizzes: {
        'GET /api/quizzes/:contentId': 'Get quizzes for content',
        'POST /api/quizzes/:id/submit': 'Submit quiz answers',
      },
      qa: {
        'POST /api/qa/ask': 'Ask a question',
        'GET /api/qa/history/:contentId': 'Get Q&A history',
      },
      analytics: {
        'GET /api/analytics/progress': 'Get learning progress',
        'GET /api/analytics/stats': 'Get user statistics',
      },
    },
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing gracefully...');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async () => {
  try {
    logger.info('🔄 Starting server initialization...');
    
    // Connect to databases
    await connectDatabase();
    logger.info('✅ MongoDB connected');

    const redisConnected = await connectRedis();
    if (redisConnected) {
      logger.info('✅ Redis connected');
    } else {
      logger.warn('⚠️ Redis not available - running without cache');
    }

    // Initialize vector store (optional for MVP)
    if (process.env.ENABLE_VECTOR_STORE === 'true') {
      try {
        await initializeVectorStore();
        logger.info('✅ Vector store initialized');
      } catch (error) {
        logger.error('❌ Vector store initialization failed:', error);
        logger.warn('⚠️ Continuing without vector store - Q&A features will be limited');
      }
    } else {
      logger.warn('⚠️ Vector store disabled - Q&A features will be limited');
    }

    // Start scheduled jobs
    if (process.env.ENABLE_SCHEDULED_JOBS !== 'false') {
      scheduledJobsService.start();
      logger.info('✅ Scheduled jobs started');
    } else {
      logger.warn('⚠️ Scheduled jobs disabled');
    }

    logger.info('🔄 Starting HTTP server...');
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${NODE_ENV} mode`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Gracefully shutting down...');
  scheduledJobsService.stop();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Gracefully shutting down...');
  scheduledJobsService.stop();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

export { app, io };
