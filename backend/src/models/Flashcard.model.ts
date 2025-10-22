import mongoose, { Schema, Document } from 'mongoose';

export interface IFlashcard extends Document {
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  front: string;
  back: string;
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay';
  difficulty: 'easy' | 'medium' | 'hard';
  sourceSegment: {
    startTime: number;
    endTime: number;
  };
  spacedRepetition: {
    repetitions: number;
    interval: number;
    easeFactor: number;
    nextReviewDate: Date;
    lastReviewDate?: Date;
  };
  statistics: {
    timesReviewed: number;
    timesCorrect: number;
    timesIncorrect: number;
    averageResponseTime?: number;
  };
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FlashcardSchema = new Schema<IFlashcard>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    front: {
      type: String,
      required: true,
    },
    back: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['mcq', 'truefalse', 'fillin', 'essay'],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    sourceSegment: {
      startTime: {
        type: Number,
        required: true,
      },
      endTime: {
        type: Number,
        required: true,
      },
    },
    spacedRepetition: {
      repetitions: {
        type: Number,
        default: 0,
      },
      interval: {
        type: Number,
        default: 1,
      },
      easeFactor: {
        type: Number,
        default: 2.5,
      },
      nextReviewDate: {
        type: Date,
        default: Date.now,
      },
      lastReviewDate: Date,
    },
    statistics: {
      timesReviewed: {
        type: Number,
        default: 0,
      },
      timesCorrect: {
        type: Number,
        default: 0,
      },
      timesIncorrect: {
        type: Number,
        default: 0,
      },
      averageResponseTime: Number,
    },
    tags: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
FlashcardSchema.index({ userId: 1, contentId: 1 });
FlashcardSchema.index({ userId: 1, 'spacedRepetition.nextReviewDate': 1 });

export const Flashcard = mongoose.model<IFlashcard>('Flashcard', FlashcardSchema);
