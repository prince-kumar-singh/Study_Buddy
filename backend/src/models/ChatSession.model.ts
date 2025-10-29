import mongoose, { Schema, Document } from 'mongoose';

export interface IChatSession extends Document {
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
  metadata: {
    contentType?: string;
    contentTitle?: string;
    firstQuestion?: string;
    aiGeneratedTitle?: boolean;
  };
  // New fields for advanced features
  tags: string[];
  folder?: string;
  isShared: boolean;
  shareToken?: string;
  shareExpiresAt?: Date;
  analytics: {
    viewCount: number;
    lastViewedAt?: Date;
    averageResponseTime?: number;
    totalQuestions: number;
  };
  isPinned: boolean;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSessionSchema = new Schema<IChatSession>(
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
    title: {
      type: String,
      required: true,
      default: 'New Chat',
      maxlength: 200,
    },
    lastMessageAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      contentType: String,
      contentTitle: String,
      firstQuestion: String,
      aiGeneratedTitle: { type: Boolean, default: false },
    },
    // New fields for advanced features
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    folder: {
      type: String,
      index: true,
    },
    isShared: {
      type: Boolean,
      default: false,
      index: true,
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    shareExpiresAt: {
      type: Date,
    },
    analytics: {
      viewCount: { type: Number, default: 0 },
      lastViewedAt: Date,
      averageResponseTime: Number,
      totalQuestions: { type: Number, default: 0 },
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    color: {
      type: String,
      enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray', null],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
ChatSessionSchema.index({ userId: 1, contentId: 1, lastMessageAt: -1 });
ChatSessionSchema.index({ userId: 1, lastMessageAt: -1 });
ChatSessionSchema.index({ userId: 1, folder: 1 });
ChatSessionSchema.index({ userId: 1, tags: 1 });
ChatSessionSchema.index({ shareToken: 1, isShared: 1 });
ChatSessionSchema.index({ userId: 1, isPinned: -1, lastMessageAt: -1 });

// Generate unique share token
ChatSessionSchema.methods.generateShareToken = function (): string {
  const crypto = require('crypto');
  this.shareToken = crypto.randomBytes(16).toString('hex');
  this.isShared = true;
  return this.shareToken;
};

// Check if share link is expired
ChatSessionSchema.methods.isShareExpired = function (): boolean {
  if (!this.shareExpiresAt) return false;
  return new Date() > this.shareExpiresAt;
};

// Increment view count
ChatSessionSchema.methods.incrementViewCount = function (): void {
  this.analytics.viewCount += 1;
  this.analytics.lastViewedAt = new Date();
};

// Auto-generate title from first question when messageCount = 1
ChatSessionSchema.pre('save', async function (next) {
  if (this.isNew && this.messageCount === 0) {
    this.title = 'New Chat';
  }
  next();
});

export const ChatSession = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
