import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  role: 'student' | 'teacher' | 'admin';
  subscription: {
    tier: 'free' | 'premium' | 'institutional';
    startDate?: Date;
    endDate?: Date;
  };
  preferences: {
    language: string;
    timezone: string;
    notifications: boolean;
    pomodoroInterval: number;
  };
  usage: {
    qaQuestionsThisWeek: number;
    weekResetDate: Date;
  };
  oauth: {
    google?: string;
    github?: string;
  };
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: String,
    role: {
      type: String,
      enum: ['student', 'teacher', 'admin'],
      default: 'student',
    },
    subscription: {
      tier: {
        type: String,
        enum: ['free', 'premium', 'institutional'],
        default: 'free',
      },
      startDate: Date,
      endDate: Date,
    },
    preferences: {
      language: {
        type: String,
        default: 'en',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      notifications: {
        type: Boolean,
        default: true,
      },
      pomodoroInterval: {
        type: Number,
        default: 25,
      },
    },
    usage: {
      qaQuestionsThisWeek: {
        type: Number,
        default: 0,
      },
      weekResetDate: {
        type: Date,
        default: () => {
          const now = new Date();
          now.setDate(now.getDate() + 7);
          return now;
        },
      },
    },
    oauth: {
      google: String,
      github: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Reset Q&A usage counter weekly
UserSchema.pre('save', function (next) {
  const now = new Date();
  if (now > this.usage.weekResetDate) {
    this.usage.qaQuestionsThisWeek = 0;
    this.usage.weekResetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  next();
});

export const User = mongoose.model<IUser>('User', UserSchema);
