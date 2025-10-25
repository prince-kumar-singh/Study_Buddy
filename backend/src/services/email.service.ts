import nodemailer, { Transporter } from 'nodemailer'
import { logger } from '../config/logger'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

interface ContentResumeEmailData {
  userName: string
  userEmail: string
  contentTitle: string
  contentId: string
  contentType: string
  pausedReason: string
  pausedDuration: string
  frontendUrl: string
}

class EmailService {
  private transporter: Transporter | null = null
  private isConfigured: boolean = false

  constructor() {
    this.initialize()
  }

  /**
   * Initialize email transporter with SMTP configuration
   */
  private initialize(): void {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_SECURE,
      EMAIL_FROM,
      ENABLE_EMAIL_NOTIFICATIONS,
    } = process.env

    // Check if email notifications are enabled
    if (ENABLE_EMAIL_NOTIFICATIONS !== 'true') {
      logger.info('Email notifications are disabled')
      return
    }

    // Validate required configuration
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
      logger.warn(
        'Email service not configured. Missing required environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM'
      )
      return
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })

      this.isConfigured = true
      logger.info(`Email service initialized with SMTP host: ${SMTP_HOST}`)

      // Verify SMTP connection
      this.transporter.verify((error) => {
        if (error) {
          logger.error('Email service verification failed:', error)
          this.isConfigured = false
        } else {
          logger.info('Email service is ready to send emails')
        }
      })
    } catch (error) {
      logger.error('Failed to initialize email service:', error)
      this.isConfigured = false
    }
  }

  /**
   * Send a generic email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured. Email not sent.')
      return false
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Study Buddy" <noreply@studybuddy.ai>',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      }

      const info = await this.transporter.sendMail(mailOptions)
      logger.info(`Email sent successfully to ${options.to}: ${info.messageId}`)
      return true
    } catch (error) {
      logger.error('Failed to send email:', error)
      return false
    }
  }

  /**
   * Send content auto-resume notification email
   */
  async sendContentResumeEmail(data: ContentResumeEmailData): Promise<boolean> {
    const { userName, userEmail, contentTitle, contentId, contentType, pausedReason, pausedDuration, frontendUrl } = data

    const subject = '✅ Your content processing has resumed!'

    const html = this.getContentResumeEmailTemplate({
      userName,
      contentTitle,
      contentId,
      contentType,
      pausedReason,
      pausedDuration,
      frontendUrl,
    })

    const text = `
Hi ${userName},

Good news! Your content "${contentTitle}" has automatically resumed processing after the API quota reset.

Content Type: ${contentType}
Pause Reason: ${pausedReason}
Paused Duration: ${pausedDuration}

View your content: ${frontendUrl}/content/${contentId}

The content will continue processing and you'll be able to access your study materials once complete.

Questions? Reply to this email or visit our help center.

Best regards,
Study Buddy Team

---
You're receiving this email because you uploaded content to Study Buddy.
To manage your email preferences, visit: ${frontendUrl}/settings/notifications
    `.trim()

    return await this.sendEmail({
      to: userEmail,
      subject,
      html,
      text,
    })
  }

  /**
   * HTML template for content resume email
   */
  private getContentResumeEmailTemplate(data: {
    userName: string
    contentTitle: string
    contentId: string
    contentType: string
    pausedReason: string
    pausedDuration: string
    frontendUrl: string
  }): string {
    const { userName, contentTitle, contentId, contentType, pausedReason, pausedDuration, frontendUrl } = data

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Processing Resumed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .email-container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #3B82F6;
      margin-bottom: 10px;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1F2937;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .content-info {
      background-color: #F3F4F6;
      border-left: 4px solid #3B82F6;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .content-info p {
      margin: 8px 0;
      font-size: 14px;
    }
    .content-info strong {
      color: #1F2937;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 28px;
      background-color: #3B82F6;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #2563EB;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      font-size: 12px;
      color: #6B7280;
      text-align: center;
    }
    .footer a {
      color: #3B82F6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="logo">📚 Study Buddy</div>
      <div class="success-icon">✅</div>
      <h1>Your Content is Processing Again!</h1>
    </div>

    <p>Hi ${userName},</p>

    <p>Great news! Your content <strong>"${contentTitle}"</strong> has automatically resumed processing after the API quota reset.</p>

    <div class="content-info">
      <p><strong>Content Type:</strong> ${contentType.toUpperCase()}</p>
      <p><strong>Pause Reason:</strong> ${pausedReason}</p>
      <p><strong>Paused Duration:</strong> ${pausedDuration}</p>
      <p><strong>Status:</strong> <span style="color: #10B981;">Processing</span></p>
    </div>

    <p>The content is now being processed and you'll be able to access your study materials (flashcards, quizzes, summaries, and Q&A) once complete.</p>

    <div style="text-align: center;">
      <a href="${frontendUrl}/content/${contentId}" class="cta-button">
        View Content Status →
      </a>
    </div>

    <p style="margin-top: 30px; font-size: 14px; color: #6B7280;">
      💡 <strong>Tip:</strong> To avoid quota issues in the future, consider spreading out your content uploads throughout the day or upgrading to a paid API plan for higher limits.
    </p>

    <div class="footer">
      <p>Questions? Reply to this email or visit our <a href="${frontendUrl}/help">help center</a>.</p>
      <p style="margin-top: 10px;">
        You're receiving this email because you uploaded content to Study Buddy.<br>
        <a href="${frontendUrl}/settings/notifications">Manage email preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim()
  }

  /**
   * Send quota limit warning email
   */
  async sendQuotaWarningEmail(
    userEmail: string,
    userName: string,
    usagePercentage: number,
    remainingRequests: number
  ): Promise<boolean> {
    const subject = '⚠️ API Quota Warning - Study Buddy'

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quota Warning</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .email-container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .warning-header {
      text-align: center;
      margin-bottom: 30px;
    }
    .warning-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1F2937;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .usage-bar {
      width: 100%;
      height: 30px;
      background-color: #E5E7EB;
      border-radius: 15px;
      overflow: hidden;
      margin: 20px 0;
    }
    .usage-fill {
      height: 100%;
      background-color: ${usagePercentage >= 90 ? '#EF4444' : '#F59E0B'};
      width: ${usagePercentage}%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="warning-header">
      <div class="warning-icon">⚠️</div>
      <h1>You're Running Low on API Quota</h1>
    </div>

    <p>Hi ${userName},</p>

    <p>You've used <strong>${usagePercentage.toFixed(1)}%</strong> of your daily API quota. You have <strong>${remainingRequests}</strong> requests remaining for today.</p>

    <div class="usage-bar">
      <div class="usage-fill">${usagePercentage.toFixed(0)}%</div>
    </div>

    <p><strong>What happens when quota is exhausted?</strong></p>
    <ul>
      <li>New content processing will be automatically paused</li>
      <li>Existing content will resume automatically when quota resets at midnight Pacific Time</li>
      <li>You can still access your existing study materials</li>
    </ul>

    <p><strong>Recommendations:</strong></p>
    <ul>
      <li>🕒 Spread out content uploads throughout the day</li>
      <li>📊 Visit your <a href="${process.env.FRONTEND_URL}/quota-dashboard">Quota Dashboard</a> to monitor usage</li>
      <li>⬆️ Consider upgrading to a paid Google AI plan for higher limits</li>
    </ul>

    <p style="margin-top: 30px;">Best regards,<br>Study Buddy Team</p>
  </div>
</body>
</html>
    `.trim()

    return await this.sendEmail({
      to: userEmail,
      subject,
      html,
    })
  }

  /**
   * Strip HTML tags from string (for plain text email fallback)
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  }

  /**
   * Check if email service is configured and ready
   */
  isReady(): boolean {
    return this.isConfigured
  }
}

export const emailService = new EmailService()
