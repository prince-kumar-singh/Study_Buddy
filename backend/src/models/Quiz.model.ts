import mongoose, { Schema, Document } from 'mongoose';

export interface IQuizQuestion {
  question: string;
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay';
  options?: string[]; // For MCQ
  correctAnswer: string | string[]; // Can be array for multiple correct answers
  explanation?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  sourceSegment: {
    startTime: number;
    endTime: number;
  };
  points: number;
  tags?: string[];
}

export interface IQuiz extends Document {
  contentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  questions: IQuizQuestion[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  totalPoints: number;
  passingScore: number; // Percentage (e.g., 70 for 70%)
  timeLimit?: number; // In minutes, optional
  metadata: {
    generationTime: number;
    model: string;
    topicsCovered?: string[];
    estimatedDuration?: number; // In minutes
  };
  statistics: {
    totalAttempts: number;
    averageScore: number;
    averageTimeSpent: number; // In seconds
    completionRate: number; // Percentage
  };
  // Version tracking for audit trail and regeneration
  version: number;
  generationMethod: 'auto' | 'manual' | 'regenerated';
  generationAttempts: number; // Track failed attempts before success
  previousVersionId?: mongoose.Types.ObjectId; // Link to replaced quiz
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuizQuestionSchema = new Schema<IQuizQuestion>({
  question: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['mcq', 'truefalse', 'fillin', 'essay'],
    required: true,
  },
  options: [String],
  correctAnswer: {
    type: Schema.Types.Mixed, // Can be string or array
    required: true,
  },
  explanation: String,
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true,
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
  points: {
    type: Number,
    required: true,
    default: 10,
  },
  tags: [String],
});

const QuizSchema = new Schema<IQuiz>(
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
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    questions: {
      type: [QuizQuestionSchema],
      required: true,
      validate: {
        validator: function (questions: IQuizQuestion[]) {
          return questions.length >= 1 && questions.length <= 50;
        },
        message: 'Quiz must have between 1 and 50 questions',
      },
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      required: true,
    },
    totalPoints: {
      type: Number,
      required: true,
    },
    passingScore: {
      type: Number,
      required: true,
      default: 70,
      min: 0,
      max: 100,
    },
    timeLimit: {
      type: Number,
      min: 1,
    },
    metadata: {
      generationTime: Number,
      model: String,
      topicsCovered: [String],
      estimatedDuration: Number,
    },
    statistics: {
      totalAttempts: {
        type: Number,
        default: 0,
      },
      averageScore: {
        type: Number,
        default: 0,
      },
      averageTimeSpent: {
        type: Number,
        default: 0,
      },
      completionRate: {
        type: Number,
        default: 0,
      },
    },
    // Version tracking for audit trail and regeneration
    version: {
      type: Number,
      default: 1,
    },
    generationMethod: {
      type: String,
      enum: ['auto', 'manual', 'regenerated'],
      default: 'auto',
    },
    generationAttempts: {
      type: Number,
      default: 1,
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'Quiz',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
QuizSchema.index({ contentId: 1, isActive: 1 });
QuizSchema.index({ userId: 1, createdAt: -1 });
QuizSchema.index({ contentId: 1, difficulty: 1 });

// Pre-save hook to calculate total points
QuizSchema.pre('save', function (next) {
  if (this.isModified('questions')) {
    this.totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
  }
  next();
});

export const Quiz = mongoose.model<IQuiz>('Quiz', QuizSchema);
