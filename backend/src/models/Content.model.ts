import mongoose, { Schema, Document } from 'mongoose';

export interface IContent extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'youtube' | 'pdf' | 'docx' | 'txt';
  title: string;
  description?: string;
  sourceUrl?: string;
  cloudinaryPublicId?: string;
  sourceFile?: {
    originalName: string;
    mimeType: string;
    size: number;
    gcsPath: string;
  };
  metadata: {
    duration?: number;
    pageCount?: number;
    totalPages?: number;
    totalCharacters?: number;
    totalChunks?: number;
    wordCount?: number;
    language?: string;
    author?: string;
    videoId?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    uploadDate?: Date;
    error?: string;
    pausedReason?: string;
    pausedAt?: Date;
    quotaInfo?: any;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  processingStages: {
    transcription: {
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      retryCount?: number;
      lastRetryAt?: Date;
      errorType?: string;
      errorDetails?: any;
    };
    vectorization: {
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      vectorStoreId?: string;
      retryCount?: number;
      lastRetryAt?: Date;
      errorType?: string;
      errorDetails?: any;
    };
    summarization: {
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      retryCount?: number;
      lastRetryAt?: Date;
      errorType?: string;
      errorDetails?: any;
    };
    flashcardGeneration: {
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      retryCount?: number;
      lastRetryAt?: Date;
      errorType?: string;
      errorDetails?: any;
    };
    quizGeneration: {
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
      progress: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      retryCount?: number;
      lastRetryAt?: Date;
      errorType?: string;
      errorDetails?: any;
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
    cloudinaryPublicId: String,
    sourceFile: {
      originalName: String,
      mimeType: String,
      size: Number,
      gcsPath: String,
    },
    metadata: {
      duration: Number,
      pageCount: Number,
      totalPages: Number,
      totalCharacters: Number,
      totalChunks: Number,
      wordCount: Number,
      language: String,
      author: String,
      videoId: String,
      fileName: String,
      fileSize: Number,
      mimeType: String,
      uploadDate: Date,
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
        retryCount: { type: Number, default: 0 },
        lastRetryAt: Date,
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
        retryCount: { type: Number, default: 0 },
        lastRetryAt: Date,
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
        retryCount: { type: Number, default: 0 },
        lastRetryAt: Date,
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
        retryCount: { type: Number, default: 0 },
        lastRetryAt: Date,
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
        retryCount: { type: Number, default: 0 },
        lastRetryAt: Date,
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
