import mongoose, { Schema, Document } from 'mongoose';

export interface ITranscript extends Document {
  contentId: mongoose.Types.ObjectId;
  segments: Array<{
    text: string;
    startTime: number;
    endTime: number;
    speaker?: string;
    confidence?: number;
  }>;
  fullText: string;
  language: string;
  metadata: {
    provider: string;
    model?: string;
    accuracy?: number;
    processingTime?: number;
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
      provider: String,
      model: String,
      accuracy: Number,
      processingTime: Number,
    },
  },
  {
    timestamps: true,
  }
);

export const Transcript = mongoose.model<ITranscript>('Transcript', TranscriptSchema);
