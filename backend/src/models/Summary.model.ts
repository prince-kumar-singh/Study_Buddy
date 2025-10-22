import mongoose, { Schema, Document } from 'mongoose';

export interface ISummary extends Document {
  contentId: mongoose.Types.ObjectId;
  type: 'quick' | 'brief' | 'detailed';
  content: string;
  keyPoints: string[];
  topics: string[];
  metadata: {
    wordCount: number;
    generationTime: number;
    model: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SummarySchema = new Schema<ISummary>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['quick', 'brief', 'detailed'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    keyPoints: [String],
    topics: [String],
    metadata: {
      wordCount: Number,
      generationTime: Number,
      model: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index
SummarySchema.index({ contentId: 1, type: 1 });

export const Summary = mongoose.model<ISummary>('Summary', SummarySchema);
