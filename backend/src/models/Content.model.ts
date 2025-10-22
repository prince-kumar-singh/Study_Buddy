import mongoose, { Schema, Document } from 'mongoose';

export interface IContent extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'youtube' | 'pdf' | 'docx' | 'txt';
  title: string;
  description?: string;
  sourceUrl?: string;
  sourceFile?: {
    originalName: string;
    mimeType: string;
    size: number;
    gcsPath: string;
  };
  metadata: {
    duration?: number;
    pageCount?: number;
    wordCount?: number;
    language?: string;
    author?: string;
    videoId?: string;
    error?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processingStages: {
    transcription: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    };
    vectorization: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      vectorStoreId?: string;
    };
    summarization: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    };
    flashcardGeneration: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    };
    quizGeneration: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    };
  };
  tags: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['youtube', 'pdf', 'docx', 'txt'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    sourceUrl: String,
    sourceFile: {
      originalName: String,
      mimeType: String,
      size: Number,
      gcsPath: String,
    },
    metadata: {
      duration: Number,
      pageCount: Number,
      wordCount: Number,
      language: String,
      author: String,
      videoId: String,
      error: String,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    processingStages: {
      transcription: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending',
        },
        progress: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        error: String,
      },
      vectorization: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending',
        },
        progress: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        error: String,
        vectorStoreId: String,
      },
      summarization: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending',
        },
        progress: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        error: String,
      },
      flashcardGeneration: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending',
        },
        progress: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        error: String,
      },
      quizGeneration: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending',
        },
        progress: { type: Number, default: 0 },
        startedAt: Date,
        completedAt: Date,
        error: String,
      },
    },
    tags: [String],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
ContentSchema.index({ userId: 1, status: 1 });
ContentSchema.index({ userId: 1, createdAt: -1 });
ContentSchema.index({ userId: 1, isDeleted: 1 });

export const Content = mongoose.model<IContent>('Content', ContentSchema);
