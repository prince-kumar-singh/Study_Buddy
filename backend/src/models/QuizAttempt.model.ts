import mongoose, { Schema, Document } from 'mongoose';

export interface IQuizAnswer {
  questionIndex: number;
  userAnswer: string | string[];
  isCorrect: boolean;
  pointsEarned: number;
  timeSpent: number; // In seconds
  timestamp: Date;
}

export interface IQuizAttempt extends Document {
  quizId: mongoose.Types.ObjectId;
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  answers: IQuizAnswer[];
  score: number; // Points earned
  totalPoints: number;
  percentage: number;
  timeSpent: number; // Total time in seconds
  startedAt: Date;
  completedAt?: Date;
  status: 'in-progress' | 'completed' | 'abandoned';
  performance: {
    correctAnswers: number;
    incorrectAnswers: number;
    skippedAnswers: number;
    averageTimePerQuestion: number;
    strongTopics: string[];
    weakTopics: string[];
  };
  feedback?: {
    overallFeedback: string;
    suggestedResources?: string[];
    nextDifficultyLevel?: 'beginner' | 'intermediate' | 'advanced';
  };
  createdAt: Date;
  updatedAt: Date;
}

const QuizAnswerSchema = new Schema<IQuizAnswer>({
  questionIndex: {
    type: Number,
    required: true,
  },
  userAnswer: {
    type: Schema.Types.Mixed, // Can be string or array
    required: true,
  },
  isCorrect: {
    type: Boolean,
    required: true,
  },
  pointsEarned: {
    type: Number,
    required: true,
    default: 0,
  },
  timeSpent: {
    type: Number,
    required: true,
    default: 0,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    quizId: {
      type: Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
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
    answers: {
      type: [QuizAnswerSchema],
      default: [],
    },
    score: {
      type: Number,
      required: true,
      default: 0,
    },
    totalPoints: {
      type: Number,
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    timeSpent: {
      type: Number,
      required: true,
      default: 0,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: Date,
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'abandoned'],
      default: 'in-progress',
      index: true,
    },
    performance: {
      correctAnswers: {
        type: Number,
        default: 0,
      },
      incorrectAnswers: {
        type: Number,
        default: 0,
      },
      skippedAnswers: {
        type: Number,
        default: 0,
      },
      averageTimePerQuestion: {
        type: Number,
        default: 0,
      },
      strongTopics: [String],
      weakTopics: [String],
    },
    feedback: {
      overallFeedback: String,
      suggestedResources: [String],
      nextDifficultyLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
QuizAttemptSchema.index({ userId: 1, status: 1 });
QuizAttemptSchema.index({ quizId: 1, userId: 1, createdAt: -1 });
QuizAttemptSchema.index({ contentId: 1, userId: 1 });
QuizAttemptSchema.index({ userId: 1, completedAt: -1 });

// Pre-save hook to calculate performance metrics
QuizAttemptSchema.pre('save', function (next) {
  if (this.isModified('answers')) {
    const totalAnswers = this.answers.length;
    
    this.performance.correctAnswers = this.answers.filter(a => a.isCorrect).length;
    this.performance.incorrectAnswers = this.answers.filter(a => !a.isCorrect).length;
    this.performance.averageTimePerQuestion = 
      totalAnswers > 0 
        ? this.answers.reduce((sum, a) => sum + a.timeSpent, 0) / totalAnswers 
        : 0;
  }
  
  if (this.isModified('score') || this.isModified('totalPoints')) {
    this.percentage = this.totalPoints > 0 
      ? Math.round((this.score / this.totalPoints) * 100) 
      : 0;
  }
  
  next();
});

export const QuizAttempt = mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);
