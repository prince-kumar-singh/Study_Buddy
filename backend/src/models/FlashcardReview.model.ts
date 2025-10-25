import mongoose, { Schema, Document } from 'mongoose';

export interface IFlashcardReview extends Document {
  userId: mongoose.Types.ObjectId;
  flashcardId: mongoose.Types.ObjectId;
  contentId: mongoose.Types.ObjectId;
  quality: number; // 0-5
  responseTime: number; // milliseconds
  wasCorrect: boolean; // quality >= 3
  easeFactor: number;
  interval: number;
  reviewedAt: Date;
}

const FlashcardReviewSchema = new Schema<IFlashcardReview>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    flashcardId: {
      type: Schema.Types.ObjectId,
      ref: 'Flashcard',
      required: true,
      index: true,
    },
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
      index: true,
    },
    quality: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
    },
    responseTime: {
      type: Number,
      required: true,
      min: 0,
    },
    wasCorrect: {
      type: Boolean,
      required: true,
    },
    easeFactor: {
      type: Number,
      required: true,
    },
    interval: {
      type: Number,
      required: true,
    },
    reviewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for analytics queries
FlashcardReviewSchema.index({ userId: 1, reviewedAt: -1 });
FlashcardReviewSchema.index({ userId: 1, contentId: 1 });
FlashcardReviewSchema.index({ flashcardId: 1, reviewedAt: -1 });

export const FlashcardReview = mongoose.model<IFlashcardReview>(
  'FlashcardReview',
  FlashcardReviewSchema
);
