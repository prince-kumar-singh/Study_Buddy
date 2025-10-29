import express, { Request, Response } from 'express';
import { ChatSession } from '../models/ChatSession.model';
import { QA } from '../models/QA.model';
import { Content } from '../models/Content.model';
import { authenticate } from '../middleware/auth.middleware';
import { sessionTitleGenerator } from '../services/ai/session-title-generator.service';
import mongoose from 'mongoose';
import { logger } from '../config/logger';
import crypto from 'crypto';

const router = express.Router();

// Debug log to verify this file is loaded
logger.info('🔧 Chat session routes module loaded');

/**
 * TEST POST route
 */
router.post('/test', (req: Request, res: Response) => {
  logger.info('=== TEST POST route hit ===');
  res.json({ message: 'Test successful' });
});

/**
 * Create a new chat session
 * POST /api/chat-sessions
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('=== Chat session creation endpoint hit ===');
    logger.info('Request body:', req.body);
    logger.info('User:', (req as any).user);
    
    const userId = (req as any).user.id;
    const { contentId, title } = req.body;

    logger.info(`Attempting to create session for userId: ${userId}, contentId: ${contentId}`);

    if (!contentId) {
      logger.warn('No contentId provided in request');
      res.status(400).json({ message: 'Content ID is required' });
      return;
    }

    // Verify content exists and belongs to user
    const content = await Content.findOne({
      _id: contentId,
      userId,
      isDeleted: false,
    });

    logger.info(`Content lookup result: ${content ? 'Found' : 'Not found'}`);
    if (content) {
      logger.info(`Content details: id=${content._id}, userId=${content.userId}, title=${content.title}`);
    }

    if (!content) {
      logger.warn(`Content not found for contentId: ${contentId}, userId: ${userId}`);
      res.status(404).json({ message: 'Content not found' });
      return;
    }

    // Create new chat session
    const chatSession = await ChatSession.create({
      contentId,
      userId,
      title: title || 'New Chat',
      lastMessageAt: new Date(),
      messageCount: 0,
      metadata: {
        contentType: content.type,
        contentTitle: content.title,
      },
    });

    logger.info(`Chat session created: ${chatSession._id} for content ${contentId}`);

    res.status(201).json({
      success: true,
      session: chatSession,
    });
  } catch (error: any) {
    logger.error('Error creating chat session:', error);
    res.status(500).json({ message: error.message });
  }
});

logger.info('✅ POST / route registered for chat-sessions');

/**
 * Get all chat sessions for a content
 * GET /api/chat-sessions/content/:contentId
 */
router.get('/content/:contentId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { contentId } = req.params;

    const sessions = await ChatSession.find({
      contentId,
      userId,
    })
      .sort({ lastMessageAt: -1 })
      .lean();

    res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (error: any) {
    logger.error('Error fetching chat sessions:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get all chat sessions for current user (across all content)
 * GET /api/chat-sessions
 * Query params: contentId (optional), limit, skip
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { contentId, limit = 50, skip = 0 } = req.query;

    // Build query filter
    const filter: any = { userId };
    if (contentId) {
      filter.contentId = contentId;
    }

    const sessions = await ChatSession.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate('contentId', 'title type')
      .lean();

    const total = await ChatSession.countDocuments(filter);

    res.json({
      success: true,
      sessions,
      total,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (error: any) {
    logger.error('Error fetching chat sessions:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get a specific chat session with its messages
 * GET /api/chat-sessions/:sessionId
 */
router.get('/:sessionId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({
      _id: sessionId,
      userId,
    }).populate('contentId', 'title type sourceUrl');

    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    // Get all messages for this session
    const messages = await QA.find({
      sessionId,
      userId,
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      session,
      messages,
      messageCount: messages.length,
    });
  } catch (error: any) {
    logger.error('Error fetching chat session:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Update chat session title
 * PATCH /api/chat-sessions/:sessionId
 */
router.patch('/:sessionId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }

    const session = await ChatSession.findOneAndUpdate(
      { _id: sessionId, userId },
      { title },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    logger.info(`Chat session title updated: ${sessionId}`);

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    logger.error('Error updating chat session:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Delete a chat session and all its messages
 * DELETE /api/chat-sessions/:sessionId
 */
router.delete('/:sessionId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    const session = mongoose.startSession();
    (await session).startTransaction();

    try {
      // Delete all Q&A messages in this session
      const qaResult = await QA.deleteMany({
        sessionId,
        userId,
      }).session(await session);

      // Delete the session
      const sessionResult = await ChatSession.deleteOne({
        _id: sessionId,
        userId,
      }).session(await session);

      if (sessionResult.deletedCount === 0) {
        await (await session).abortTransaction();
        res.status(404).json({ message: 'Chat session not found' });
        return;
      }

      await (await session).commitTransaction();

      logger.info(`Chat session deleted: ${sessionId}, messages deleted: ${qaResult.deletedCount}`);

      res.json({
        success: true,
        message: 'Chat session deleted successfully',
        deletedMessages: qaResult.deletedCount,
      });
    } catch (error) {
      await (await session).abortTransaction();
      throw error;
    } finally {
      (await session).endSession();
    }
  } catch (error: any) {
    logger.error('Error deleting chat session:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Generate AI title for session
 * POST /api/chat-sessions/:sessionId/generate-title
 */
router.post('/:sessionId/generate-title', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    // Get first few Q&A pairs
    const qas = await QA.find({ sessionId, userId })
      .sort({ createdAt: 1 })
      .limit(3)
      .lean();

    if (qas.length === 0) {
      res.status(400).json({ message: 'No messages in session to generate title from' });
      return;
    }

    const questions = qas.map((qa) => qa.question);
    const answers = qas.map((qa) => qa.answer);

    const aiTitle = await sessionTitleGenerator.generateTitleFromConversation(questions, answers);

    session.title = aiTitle;
    session.metadata.aiGeneratedTitle = true;
    await session.save();

    logger.info(`AI title generated for session ${sessionId}: ${aiTitle}`);

    res.json({
      success: true,
      session,
      title: aiTitle,
    });
  } catch (error: any) {
    logger.error('Error generating AI title:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Update session tags and folder
 * PATCH /api/chat-sessions/:sessionId/organization
 */
router.patch('/:sessionId/organization', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;
    const { tags, folder, color, isPinned } = req.body;

    const updateData: any = {};
    if (tags !== undefined) updateData.tags = tags;
    if (folder !== undefined) updateData.folder = folder;
    if (color !== undefined) updateData.color = color;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    const session = await ChatSession.findOneAndUpdate(
      { _id: sessionId, userId },
      updateData,
      { new: true }
    );

    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    logger.error('Error updating session organization:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Generate share link for session
 * POST /api/chat-sessions/:sessionId/share
 */
router.post('/:sessionId/share', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;
    const { expiresInDays } = req.body;

    const session: any = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    // Generate share token
    const shareToken = session.generateShareToken();

    // Set expiration if provided
    if (expiresInDays) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));
      session.shareExpiresAt = expiresAt;
    }

    await session.save();

    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared/session/${shareToken}`;

    logger.info(`Share link generated for session ${sessionId}`);

    res.json({
      success: true,
      shareToken,
      shareUrl,
      expiresAt: session.shareExpiresAt,
    });
  } catch (error: any) {
    logger.error('Error generating share link:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Revoke share link
 * DELETE /api/chat-sessions/:sessionId/share
 */
router.delete('/:sessionId/share', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOneAndUpdate(
      { _id: sessionId, userId },
      {
        isShared: false,
        shareToken: undefined,
        shareExpiresAt: undefined,
      },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    logger.info(`Share link revoked for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Share link revoked',
    });
  } catch (error: any) {
    logger.error('Error revoking share link:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get shared session (public, no auth required)
 * GET /api/chat-sessions/shared/:shareToken
 */
router.get('/shared/:shareToken', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareToken } = req.params;

    const session: any = await ChatSession.findOne({
      shareToken,
      isShared: true,
    }).populate('contentId', 'title type');

    if (!session) {
      res.status(404).json({ message: 'Shared session not found' });
      return;
    }

    // Check expiration
    if (session.isShareExpired()) {
      res.status(410).json({ message: 'Share link has expired' });
      return;
    }

    // Increment view count
    session.incrementViewCount();
    await session.save();

    // Get messages
    const messages = await QA.find({ sessionId: session._id })
      .sort({ createdAt: 1 })
      .select('question answer sourceSegments createdAt')
      .lean();

    res.json({
      success: true,
      session: {
        title: session.title,
        contentTitle: session.metadata?.contentTitle,
        contentType: session.metadata?.contentType,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
      },
      messages,
    });
  } catch (error: any) {
    logger.error('Error fetching shared session:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Export session as JSON/TXT
 * GET /api/chat-sessions/:sessionId/export
 */
router.get('/:sessionId/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;
    const { format = 'json' } = req.query;

    const session = await ChatSession.findOne({ _id: sessionId, userId })
      .populate('contentId', 'title type sourceUrl')
      .lean();

    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    const messages = await QA.find({ sessionId, userId })
      .sort({ createdAt: 1 })
      .lean();

    if (format === 'txt') {
      // Plain text export
      let text = `Chat Session: ${session.title}\n`;
      text += `Content: ${(session.contentId as any).title}\n`;
      text += `Date: ${new Date(session.createdAt).toLocaleString()}\n`;
      text += `Messages: ${messages.length}\n`;
      text += `\n${'='.repeat(60)}\n\n`;

      messages.forEach((msg, index) => {
        text += `[${index + 1}] Question:\n${msg.question}\n\n`;
        text += `Answer:\n${msg.answer}\n\n`;
        text += `${'─'.repeat(60)}\n\n`;
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}.txt"`);
      res.send(text);
    } else {
      // JSON export
      const exportData = {
        session: {
          id: session._id,
          title: session.title,
          content: (session.contentId as any).title,
          contentType: (session.contentId as any).type,
          createdAt: session.createdAt,
          lastMessageAt: session.lastMessageAt,
          messageCount: session.messageCount,
          tags: session.tags,
          folder: session.folder,
        },
        messages: messages.map((msg) => ({
          question: msg.question,
          answer: msg.answer,
          sourceSegments: msg.sourceSegments,
          createdAt: msg.createdAt,
        })),
        exportedAt: new Date(),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}.json"`);
      res.json(exportData);
    }
  } catch (error: any) {
    logger.error('Error exporting session:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get session analytics
 * GET /api/chat-sessions/:sessionId/analytics
 */
router.get('/:sessionId/analytics', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      res.status(404).json({ message: 'Chat session not found' });
      return;
    }

    const messages = await QA.find({ sessionId, userId }).lean();

    // Calculate analytics
    const analytics = {
      viewCount: session.analytics.viewCount,
      lastViewedAt: session.analytics.lastViewedAt,
      totalQuestions: messages.length,
      totalWords: messages.reduce((sum, msg) => sum + msg.question.split(' ').length + msg.answer.split(' ').length, 0),
      averageQuestionLength: messages.reduce((sum, msg) => sum + msg.question.length, 0) / messages.length || 0,
      averageAnswerLength: messages.reduce((sum, msg) => sum + msg.answer.length, 0) / messages.length || 0,
      firstMessageAt: messages[0]?.createdAt,
      lastMessageAt: messages[messages.length - 1]?.createdAt,
      sessionDuration: messages.length > 1
        ? new Date(messages[messages.length - 1].createdAt).getTime() - new Date(messages[0].createdAt).getTime()
        : 0,
    };

    res.json({
      success: true,
      analytics,
    });
  } catch (error: any) {
    logger.error('Error fetching session analytics:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Search/filter sessions
 * GET /api/chat-sessions/search
 */
router.get('/search/query', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { q, tags, folder, contentId, isPinned, limit = 50 } = req.query;

    const query: any = { userId };

    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { 'metadata.firstQuestion': { $regex: q, $options: 'i' } },
      ];
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      query.tags = { $in: tagArray };
    }

    if (folder) {
      query.folder = folder;
    }

    if (contentId) {
      query.contentId = contentId;
    }

    if (isPinned !== undefined) {
      query.isPinned = isPinned === 'true';
    }

    const sessions = await ChatSession.find(query)
      .sort({ isPinned: -1, lastMessageAt: -1 })
      .limit(Number(limit))
      .populate('contentId', 'title type')
      .lean();

    res.json({
      success: true,
      sessions,
      total: sessions.length,
      query: { q, tags, folder, contentId, isPinned },
    });
  } catch (error: any) {
    logger.error('Error searching sessions:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
