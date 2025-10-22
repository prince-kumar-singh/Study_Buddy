import mongoose, { Schema, Document } from 'mongoose';

export interface IQA extends Document {
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  question: string;
  answer: string;
  sourceSegments: Array<{
    startTime: number;
    endTime: number;
    relevance: number;
  }>;
  relatedFlashcards: mongoose.Types.ObjectId[];
  feedback?: {
    helpful: boolean;
    comment?: string;
  };
  metadata: {
    responseTime: number;
    model: string;
    confidence?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const QASchema = new Schema<IQA>(
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
    question: {
      type: String,
      required: true,
      maxlength: 500,
    },
    answer: {
      type: String,
      required: true,
    },
    sourceSegments: [
      {
        startTime: Number,
        endTime: Number,
        relevance: Number,
      },
    ],
    relatedFlashcards: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Flashcard',
      },
    ],
    feedback: {
      helpful: Boolean,
      comment: String,
    },
    metadata: {
      responseTime: Number,
      model: String,
      confidence: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
QASchema.index({ userId: 1, contentId: 1, createdAt: -1 });

export const QA = mongoose.model<IQA>('QA', QASchema);
