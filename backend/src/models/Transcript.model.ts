import mongoose, { Schema, Document } from 'mongoose';

export interface ITranscript extends Document {
  contentId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  segments: Array<{
    text: string;
    startTime: number;
    endTime: number;
    speaker?: string;
    confidence?: number;
    metadata?: any;
  }>;
  fullText: string;
  language: string;
  metadata: {
    provider?: string;
    source?: string;
    model?: string;
    accuracy?: number;
    processingTime?: number;
    videoId?: string;
    title?: string;
    author?: string;
    duration?: number | string;
    totalChunks?: number;
    qualityAssessment?: any;
    fileType?: string;
    fileName?: string;
    reason?: string;
    [key: string]: any; // Allow additional fields
  };
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptSchema = new Schema<ITranscript>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    segments: [
      {
        text: {
          type: String,
          required: true,
        },
        startTime: {
          type: Number,
          required: true,
        },
        endTime: {
          type: Number,
          required: true,
        },
        speaker: String,
        confidence: Number,
        metadata: Schema.Types.Mixed,
      },
    ],
    fullText: {
      type: String,
      required: true,
      text: true, // Text index for search
    },
    language: {
      type: String,
      default: 'en',
    },
    metadata: {
      type: Schema.Types.Mixed, // Allow flexible metadata structure
      default: {},
    },
  },
  {
    timestamps: true,
    strict: false, // Allow additional fields not in schema
  }
);

export const Transcript = mongoose.model<ITranscript>('Transcript', TranscriptSchema);
