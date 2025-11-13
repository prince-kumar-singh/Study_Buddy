import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { Content } from '../models/Content.model';
import { Summary } from '../models/Summary.model';
import { Flashcard } from '../models/Flashcard.model';
import { Quiz } from '../models/Quiz.model';
import { QA } from '../models/QA.model';
import { ChatSession } from '../models/ChatSession.model';
import { ApiRequestLog } from '../models/ApiRequestLog.model';

const router = Router();

// All analytics routes require authentication
router.use(authenticate);

router.get('/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const baseMatch = { userId: userObjectId, isDeleted: false } as any;

    const [
      totalContents,
      pending,
      processing,
      completed,
      failed,
      paused,
      stageAverages,
      processingItems
    ] = await Promise.all([
      Content.countDocuments(baseMatch),
      Content.countDocuments({ ...baseMatch, status: 'pending' }),
      Content.countDocuments({ ...baseMatch, status: 'processing' }),
      Content.countDocuments({ ...baseMatch, status: 'completed' }),
      Content.countDocuments({ ...baseMatch, status: 'failed' }),
      // Some parts of code reference 'paused' even if enum may not include it; count safely
      Content.countDocuments({ ...baseMatch, status: 'paused' as any }),
      Content.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            transcriptionAvg: { $avg: '$processingStages.transcription.progress' },
            vectorizationAvg: { $avg: '$processingStages.vectorization.progress' },
            summarizationAvg: { $avg: '$processingStages.summarization.progress' },
            flashcardAvg: { $avg: '$processingStages.flashcardGeneration.progress' },
            quizAvg: { $avg: '$processingStages.quizGeneration.progress' },
          }
        }
      ]),
      Content.find({ ...baseMatch, status: 'processing' })
        .select('title processingStages createdAt updatedAt')
        .lean()
    ]);

    const stageAvg = stageAverages[0] || {};

    const items = (processingItems || []).map((c: any) => {
      const stages = c.processingStages || {};
      const progressValues = [
        stages.transcription?.progress ?? 0,
        stages.vectorization?.progress ?? 0,
        stages.summarization?.progress ?? 0,
        stages.flashcardGeneration?.progress ?? 0,
        stages.quizGeneration?.progress ?? 0,
      ];
      const overallProgress = progressValues.reduce((a, b) => a + b, 0) / progressValues.length;
      return {
        title: c.title,
        overallProgress,
        stages: {
          transcription: stages.transcription?.progress ?? 0,
          vectorization: stages.vectorization?.progress ?? 0,
          summarization: stages.summarization?.progress ?? 0,
          flashcardGeneration: stages.flashcardGeneration?.progress ?? 0,
          quizGeneration: stages.quizGeneration?.progress ?? 0,
        },
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    res.json({
      success: true,
      data: {
        totals: {
          totalContents,
          pending,
          processing,
          completed,
          failed,
          paused,
        },
        stageAverages: {
          transcription: stageAvg.transcriptionAvg ?? 0,
          vectorization: stageAvg.vectorizationAvg ?? 0,
          summarization: stageAvg.summarizationAvg ?? 0,
          flashcardGeneration: stageAvg.flashcardAvg ?? 0,
          quizGeneration: stageAvg.quizAvg ?? 0,
        },
        processingItems: items,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const baseUserMatch = { userId: userObjectId } as any;

    const [
      totalContents,
      totalSummaries,
      totalFlashcards,
      totalQuizzes,
      totalQA,
      totalSessions,
      contentsByStatus,
      contents7d,
      apiSummary,
    ] = await Promise.all([
      Content.countDocuments({ ...baseUserMatch, isDeleted: false }),
      Summary.countDocuments({}), // per content; not user-scoped
      Flashcard.countDocuments(baseUserMatch),
      Quiz.countDocuments(baseUserMatch),
      QA.countDocuments(baseUserMatch),
      ChatSession.countDocuments(baseUserMatch),
      Content.aggregate([
        { $match: { ...baseUserMatch, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Content.aggregate([
        { $match: { ...baseUserMatch, isDeleted: false, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: {
              y: { $year: '$createdAt' },
              m: { $month: '$createdAt' },
              d: { $dayOfMonth: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
      ]),
      ApiRequestLog.aggregate([
        { $match: { ...baseUserMatch, timestamp: { $gte: twentyFourHoursAgo } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
            failures: { $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] } },
            quotaExceeded: { $sum: { $cond: [{ $eq: ['$status', 'quota_exceeded'] }, 1, 0] } },
            avgLatencyMs: { $avg: '$requestDuration' },
          },
        },
      ]),
    ]);

    const statusBreakdown = (contentsByStatus || []).reduce((acc: any, cur: any) => {
      acc[cur._id || 'unknown'] = cur.count;
      return acc;
    }, {} as Record<string, number>);

    const dailyNewContents = (contents7d || []).map((d: any) => ({
      date: new Date(d._id.y, d._id.m - 1, d._id.d).toISOString().slice(0, 10),
      count: d.count,
    }));

    const apiAgg = apiSummary[0] || { total: 0, successes: 0, failures: 0, quotaExceeded: 0, avgLatencyMs: null };

    res.json({
      success: true,
      data: {
        totals: {
          contents: totalContents,
          summaries: totalSummaries,
          flashcards: totalFlashcards,
          quizzes: totalQuizzes,
          qa: totalQA,
          chatSessions: totalSessions,
        },
        contentsByStatus: statusBreakdown,
        activity: {
          dailyNewContents,
          windowDays: 7,
        },
        apiUsageLast24h: {
          total: apiAgg.total || 0,
          successes: apiAgg.successes || 0,
          failures: apiAgg.failures || 0,
          quotaExceeded: apiAgg.quotaExceeded || 0,
          avgLatencyMs: apiAgg.avgLatencyMs ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
