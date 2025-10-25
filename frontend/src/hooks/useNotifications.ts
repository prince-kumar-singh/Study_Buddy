import { useState, useEffect, useCallback } from 'react';
import { notificationService, PomodoroTimer } from '../services/notification.service';

/**
 * Hook for managing browser notifications
 */
export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(notificationService.isSupported());
    if (notificationService.isSupported()) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const granted = await notificationService.requestPermission();
    if (notificationService.isSupported()) {
      setPermission(Notification.permission);
    }
    return granted;
  }, []);

  const showNotification = useCallback(
    async (title: string, body: string, options?: any) => {
      return notificationService.show({
        title,
        body,
        ...options,
      });
    },
    []
  );

  return {
    permission,
    supported,
    isGranted: permission === 'granted',
    requestPermission,
    showNotification,
    showReviewReminder: notificationService.showReviewReminder.bind(notificationService),
    showStudyReminder: notificationService.showStudyReminder.bind(notificationService),
    showAchievement: notificationService.showAchievement.bind(notificationService),
    showMasteryNotification: notificationService.showMasteryNotification.bind(notificationService),
  };
};

/**
 * Hook for Pomodoro timer with notifications
 */
export const usePomodoro = (studyMinutes: number = 25, breakMinutes: number = 5) => {
  const [isActive, setIsActive] = useState(false);
  const [isStudying, setIsStudying] = useState(false);
  const [timer] = useState(() => new PomodoroTimer(studyMinutes, breakMinutes));

  const startStudy = useCallback(() => {
    timer.startStudySession(() => {
      setIsActive(false);
      setIsStudying(false);
    });
    setIsActive(true);
    setIsStudying(true);
  }, [timer]);

  const startBreak = useCallback(() => {
    timer.startBreakSession(() => {
      setIsActive(false);
      setIsStudying(false);
    });
    setIsActive(true);
    setIsStudying(false);
  }, [timer]);

  const stop = useCallback(() => {
    timer.stop();
    setIsActive(false);
    setIsStudying(false);
  }, [timer]);

  useEffect(() => {
    return () => {
      timer.stop();
    };
  }, [timer]);

  return {
    isActive,
    isStudying,
    startStudy,
    startBreak,
    stop,
  };
};

/**
 * Hook to check for due flashcards and show notifications
 */
export const useFlashcardReminders = (dueCount: number, enabled: boolean = true) => {
  const { isGranted, requestPermission } = useNotifications();

  useEffect(() => {
    if (!enabled || !isGranted || dueCount === 0) return;

    // Check every hour if there are due cards
    const interval = setInterval(() => {
      if (dueCount > 0) {
        notificationService.showReviewReminder(dueCount);
      }
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(interval);
  }, [dueCount, enabled, isGranted]);

  return {
    isGranted,
    requestPermission,
  };
};

export default useNotifications;
