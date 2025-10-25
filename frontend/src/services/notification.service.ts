/**
 * Browser Notification Service
 * Handles requesting permissions and showing notifications for study reminders
 */

export type NotificationType = 'review_due' | 'study_reminder' | 'achievement';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: any;
}

class NotificationService {
  private permissionGranted: boolean = false;

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      return this.permissionGranted;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are supported and enabled
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Check if permission is granted
   */
  isPermissionGranted(): boolean {
    return this.isSupported() && Notification.permission === 'granted';
  }

  /**
   * Show a notification
   */
  async show(options: NotificationOptions): Promise<Notification | null> {
    if (!this.isSupported()) {
      console.warn('Notifications not supported');
      return null;
    }

    if (!this.isPermissionGranted()) {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Notification permission not granted');
        return null;
      }
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.png',
        badge: options.badge || '/logo.png',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        data: options.data,
      });

      // Auto-close after 10 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => notification.close(), 10000);
      }

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }

  /**
   * Show review reminder notification
   */
  async showReviewReminder(dueCount: number): Promise<Notification | null> {
    return this.show({
      title: '📚 Flashcards Due for Review',
      body: `You have ${dueCount} flashcard${dueCount !== 1 ? 's' : ''} due for review. Keep your streak going!`,
      tag: 'review_reminder',
      requireInteraction: false,
      data: { type: 'review_due', count: dueCount },
    });
  }

  /**
   * Show study reminder notification (Pomodoro break)
   */
  async showStudyReminder(message: string): Promise<Notification | null> {
    return this.show({
      title: '⏰ Study Reminder',
      body: message,
      tag: 'study_reminder',
      requireInteraction: false,
      data: { type: 'study_reminder' },
    });
  }

  /**
   * Show achievement notification
   */
  async showAchievement(title: string, description: string): Promise<Notification | null> {
    return this.show({
      title: `🎉 ${title}`,
      body: description,
      tag: 'achievement',
      requireInteraction: false,
      data: { type: 'achievement' },
    });
  }

  /**
   * Show mastery notification
   */
  async showMasteryNotification(cardCount: number): Promise<Notification | null> {
    return this.show({
      title: '🌟 New Cards Mastered!',
      body: `Congratulations! You've mastered ${cardCount} flashcard${cardCount !== 1 ? 's' : ''}!`,
      tag: 'mastery',
      requireInteraction: false,
      data: { type: 'achievement', subtype: 'mastery' },
    });
  }

  /**
   * Schedule a notification for a specific time
   * Note: This requires a Service Worker for persistent scheduling
   */
  async scheduleNotification(
    options: NotificationOptions,
    scheduledTime: Date
  ): Promise<void> {
    const now = new Date();
    const delay = scheduledTime.getTime() - now.getTime();

    if (delay <= 0) {
      console.warn('Scheduled time is in the past');
      return;
    }

    // For now, use setTimeout (will be cleared on page reload)
    // TODO: Implement Service Worker for persistent notifications
    setTimeout(() => {
      this.show(options);
    }, delay);

    console.log(`Notification scheduled for ${scheduledTime.toLocaleString()}`);
  }

  /**
   * Schedule daily review reminder
   */
  async scheduleDailyReviewReminder(hour: number = 9, minute: number = 0): Promise<void> {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    await this.scheduleNotification(
      {
        title: '📚 Daily Review Time',
        body: 'Time to review your flashcards! Stay consistent with your learning.',
        tag: 'daily_review',
        requireInteraction: false,
      },
      scheduledTime
    );
  }
}

export const notificationService = new NotificationService();

/**
 * Hook for Pomodoro-style study timer with break notifications
 */
export class PomodoroTimer {
  private studyDuration: number = 25 * 60 * 1000; // 25 minutes
  private breakDuration: number = 5 * 60 * 1000; // 5 minutes
  private timer: NodeJS.Timeout | null = null;
  private isStudying: boolean = false;

  constructor(studyMinutes: number = 25, breakMinutes: number = 5) {
    this.studyDuration = studyMinutes * 60 * 1000;
    this.breakDuration = breakMinutes * 60 * 1000;
  }

  /**
   * Start study session
   */
  startStudySession(onComplete?: () => void): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.isStudying = true;
    this.timer = setTimeout(async () => {
      await notificationService.showStudyReminder(
        `Great work! You've studied for ${this.studyDuration / 60000} minutes. Time for a ${this.breakDuration / 60000}-minute break!`
      );
      this.isStudying = false;
      if (onComplete) onComplete();
    }, this.studyDuration);
  }

  /**
   * Start break session
   */
  startBreakSession(onComplete?: () => void): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.isStudying = false;
    this.timer = setTimeout(async () => {
      await notificationService.showStudyReminder(
        'Break time is over! Ready to get back to studying?'
      );
      if (onComplete) onComplete();
    }, this.breakDuration);
  }

  /**
   * Stop timer
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isStudying = false;
  }

  /**
   * Check if currently in study mode
   */
  isActive(): boolean {
    return this.timer !== null;
  }

  /**
   * Check if studying (vs break)
   */
  isInStudyMode(): boolean {
    return this.isStudying;
  }
}

export default notificationService;
