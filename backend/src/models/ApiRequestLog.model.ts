import mongoose, { Document, Schema } from 'mongoose'

export interface IApiRequestLog extends Document {
  userId: mongoose.Types.ObjectId
  contentId?: mongoose.Types.ObjectId
  apiProvider: 'gemini' | 'openai' | 'other'
  endpoint: string
  requestType: 'embedding' | 'completion' | 'summarization' | 'flashcard' | 'quiz' | 'qa' | 'other'
  status: 'success' | 'failure' | 'quota_exceeded'
  tokensUsed?: number
  requestDuration?: number // milliseconds
  errorMessage?: string
  errorCode?: string
  timestamp: Date
  metadata?: {
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: any
  }
}

const ApiRequestLogSchema = new Schema<IApiRequestLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      index: true
    },
    apiProvider: {
      type: String,
      enum: ['gemini', 'openai', 'other'],
      required: true,
      default: 'gemini'
    },
    endpoint: {
      type: String,
      required: true
    },
    requestType: {
      type: String,
      enum: ['embedding', 'completion', 'summarization', 'flashcard', 'quiz', 'qa', 'other'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['success', 'failure', 'quota_exceeded'],
      required: true,
      index: true
    },
    tokensUsed: {
      type: Number
    },
    requestDuration: {
      type: Number
    },
    errorMessage: {
      type: String
    },
    errorCode: {
      type: String
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
)

// Index for efficient querying of recent logs
ApiRequestLogSchema.index({ userId: 1, timestamp: -1 })
ApiRequestLogSchema.index({ userId: 1, apiProvider: 1, timestamp: -1 })
ApiRequestLogSchema.index({ status: 1, timestamp: -1 })

export const ApiRequestLog = mongoose.model<IApiRequestLog>('ApiRequestLog', ApiRequestLogSchema)
