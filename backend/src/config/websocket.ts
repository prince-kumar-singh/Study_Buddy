import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

let io: SocketIOServer;

export const initializeWebSocket = (socketIO: SocketIOServer): void => {
  io = socketIO;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user?.id;
    logger.info(`WebSocket client connected: ${socket.id}, User: ${userId}`);

    // Join user-specific room
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error: ${error}`);
    });
  });
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Emit processing status updates
export const emitProcessingStatus = (
  userId: string,
  contentId: string,
  status: {
    stage: string;
    progress: number;
    message: string;
  }
): void => {
  const io = getIO();
  io.to(`user:${userId}`).emit('processing:status', {
    contentId,
    ...status,
  });
};

// Emit AI generation updates
export const emitAIGenerationStatus = (
  userId: string,
  contentId: string,
  type: 'summary' | 'flashcards' | 'quiz' | 'qa',
  status: {
    progress: number;
    message: string;
  }
): void => {
  const io = getIO();
  io.to(`user:${userId}`).emit('ai:generation', {
    contentId,
    type,
    ...status,
  });
};

// WebSocketService class for dependency injection
export class WebSocketService {
  sendToUser(userId: string, data: any): void {
    const io = getIO();
    io.to(`user:${userId}`).emit('message', data);
  }
}

export const wsService = new WebSocketService();
