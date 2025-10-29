import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, 
  Sparkles, 
  Trash2, 
  Download, 
  RefreshCw,
  MessageSquare,
  Crown,
  AlertCircle,
  Menu,
  X
} from 'lucide-react'
import { qaService, QAHistory } from '../services/qa.service'
import { contentService, Content } from '../services/content.service'
import { chatSessionService, ChatSession } from '../services/chat-session.service'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { ChatSessionSidebarEnhanced } from '../components/ChatSessionSidebarEnhanced'
import { authService } from '../services/auth.service'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: string
  sourceSegments?: Array<{
    startTime: number
    endTime: number
    relevance: number
  }>
  isStreaming?: boolean
}

const QA = () => {
  const { contentId } = useParams<{ contentId: string }>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const [content, setContent] = useState<Content | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [cooldown, setCooldown] = useState(0)
  const [userInfo, setUserInfo] = useState<any>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [retryCount, setRetryCount] = useState(0)

  // Chat session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // Fetch content info
  useEffect(() => {
    const fetchContent = async () => {
      if (!contentId) return
      try {
        const response = await contentService.getContentById(contentId)
        setContent(response.data.content)
      } catch (err: any) {
        console.error('Failed to load content:', err)
        setError(err.response?.data?.message || 'Failed to load content')
      }
    }
    fetchContent()
  }, [contentId])

  // Fetch user info for quota
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const user = await authService.getCurrentUser()
        setUserInfo(user)
        setConnectionStatus('connected')
      } catch (err) {
        console.error('Failed to fetch user info:', err)
        setConnectionStatus('disconnected')
      }
    }
    fetchUserInfo()
  }, [])

  // Fetch chat sessions for this content
  useEffect(() => {
    const fetchSessions = async () => {
      if (!contentId) return
      try {
        setIsLoadingSessions(true)
        const response: any = await chatSessionService.getSessionsByContent(contentId)
        
        // Handle response - check for data.sessions or direct sessions array
        const sessionsData = response?.data?.sessions || response?.sessions || []
        setSessions(sessionsData)
        
        // Auto-select the most recent session if exists
        if (sessionsData.length > 0) {
          setCurrentSessionId(sessionsData[0]._id)
        }
      } catch (err: any) {
        console.error('Failed to load sessions:', err)
        setSessions([]) // Set empty array on error
      } finally {
        setIsLoadingSessions(false)
      }
    }
    fetchSessions()
  }, [contentId])

  // Fetch Q&A history for current session
  useEffect(() => {
    const fetchHistory = async () => {
      if (!contentId) return
      
      // If no session selected, just load all QA for backward compatibility
      if (!currentSessionId) {
        try {
          setIsLoadingHistory(true)
          const response = await qaService.getHistory(contentId)
          
          // Convert history to messages
          const historyMessages: Message[] = []
          response.data.qas.reverse().forEach((qa: QAHistory) => {
            historyMessages.push({
              id: `user-${qa._id}`,
              type: 'user',
              content: qa.question,
              timestamp: qa.createdAt,
            })
            historyMessages.push({
              id: `assistant-${qa._id}`,
              type: 'assistant',
              content: qa.answer,
              timestamp: qa.createdAt,
              sourceSegments: qa.sourceSegments,
            })
          })
          
          setMessages(historyMessages)
        } catch (err: any) {
          console.error('Failed to load Q&A history:', err)
        } finally {
          setIsLoadingHistory(false)
        }
        return
      }

      // Load messages for specific session
      try {
        setIsLoadingHistory(true)
        const response = await qaService.getHistory(contentId)
        
        // Filter QA records by sessionId
        const sessionQAs = response.data.qas.filter(
          (qa: any) => qa.sessionId === currentSessionId
        )
        
        // Convert to messages
        const historyMessages: Message[] = []
        sessionQAs.reverse().forEach((qa: QAHistory) => {
          historyMessages.push({
            id: `user-${qa._id}`,
            type: 'user',
            content: qa.question,
            timestamp: qa.createdAt,
          })
          historyMessages.push({
            id: `assistant-${qa._id}`,
            type: 'assistant',
            content: qa.answer,
            timestamp: qa.createdAt,
            sourceSegments: qa.sourceSegments,
          })
        })
        
        setMessages(historyMessages)
      } catch (err: any) {
        console.error('Failed to load Q&A history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [contentId, currentSessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  // Session handlers
  const handleNewSession = async () => {
    if (!contentId) return
    try {
      const response: any = await chatSessionService.createSession({
        contentId,
        title: `New Chat ${new Date().toLocaleTimeString()}`,
      })
      const newSession = response.session
      setSessions((prev) => [newSession, ...prev])
      setCurrentSessionId(newSession._id)
      setMessages([])
      setFollowUpQuestions([])
      setError(null)
    } catch (err: any) {
      console.error('Failed to create session:', err)
      alert('Failed to create new chat session')
    }
  }

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId)
    setFollowUpQuestions([])
    setError(null)
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await chatSessionService.deleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s._id !== sessionId))
      
      // If deleted session was active, switch to another or clear
      if (currentSessionId === sessionId) {
        const remaining = sessions.filter((s) => s._id !== sessionId)
        if (remaining.length > 0) {
          setCurrentSessionId(remaining[0]._id)
        } else {
          setCurrentSessionId(null)
          setMessages([])
        }
      }
    } catch (err: any) {
      console.error('Failed to delete session:', err)
      alert('Failed to delete session')
    }
  }

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      await chatSessionService.updateSession(sessionId, { title: newTitle })
      setSessions((prev) =>
        prev.map((s) => (s._id === sessionId ? { ...s, title: newTitle } : s))
      )
    } catch (err: any) {
      console.error('Failed to rename session:', err)
      alert('Failed to rename session')
    }
  }

  const handleGenerateAITitle = async (sessionId: string) => {
    try {
      const response: any = await chatSessionService.generateAITitle(sessionId)
      const newTitle = response.data.title
      setSessions((prev) =>
        prev.map((s) => (s._id === sessionId ? { 
          ...s, 
          title: newTitle,
          metadata: { ...s.metadata, aiGeneratedTitle: true }
        } : s))
      )
    } catch (err: any) {
      console.error('Failed to generate AI title:', err)
      alert('Failed to generate AI title: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleTogglePin = async (sessionId: string, isPinned: boolean) => {
    try {
      await chatSessionService.updateOrganization(sessionId, { isPinned })
      setSessions((prev) =>
        prev.map((s) => (s._id === sessionId ? { ...s, isPinned } : s))
      )
    } catch (err: any) {
      console.error('Failed to toggle pin:', err)
      alert('Failed to pin/unpin session')
    }
  }

  const handleShareSession = async (sessionId: string) => {
    try {
      const response: any = await chatSessionService.shareSession(sessionId, 7)
      const shareUrl = response.data.shareUrl
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl)
      
      setSessions((prev) =>
        prev.map((s) => (s._id === sessionId ? { 
          ...s, 
          isShared: true,
          shareToken: response.data.shareToken,
          shareExpiresAt: response.data.expiresAt
        } : s))
      )
      
      alert(`Share link copied to clipboard!\n\n${shareUrl}`)
    } catch (err: any) {
      console.error('Failed to share session:', err)
      alert('Failed to generate share link: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleExportSession = async (sessionId: string, format: 'json' | 'txt') => {
    try {
      await chatSessionService.exportSession(sessionId, format)
    } catch (err: any) {
      console.error('Failed to export session:', err)
      alert('Failed to export session: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleViewAnalytics = async (sessionId: string) => {
    try {
      const response: any = await chatSessionService.getAnalytics(sessionId)
      const analytics = response.data.analytics
      
      // Simple alert for now - could be a modal in the future
      const analyticsText = `
Session Analytics:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Views: ${analytics.viewCount || 0}
💬 Questions: ${analytics.totalQuestions || 0}
📝 Total Words: ${analytics.totalWords || 0}
📏 Avg Question Length: ${analytics.averageQuestionLength?.toFixed(1) || 0} words
📄 Avg Answer Length: ${analytics.averageAnswerLength?.toFixed(1) || 0} words
⏱️ Session Duration: ${analytics.sessionDuration ? Math.round(analytics.sessionDuration / 60000) + ' minutes' : 'N/A'}
🕐 Last Viewed: ${analytics.lastViewedAt ? new Date(analytics.lastViewedAt).toLocaleString() : 'Never'}
      `.trim()
      
      alert(analyticsText)
    } catch (err: any) {
      console.error('Failed to get analytics:', err)
      alert('Failed to load analytics: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleAskQuestion = async (question: string) => {
    if (!contentId || isLoading) return

    // Auto-create session if this is the first question
    let sessionId = currentSessionId
    if (!sessionId) {
      try {
        const response: any = await chatSessionService.createSession({
          contentId,
          title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
          metadata: { firstQuestion: question },
        })
        const newSession = response.session
        setSessions((prev) => [newSession, ...prev])
        setCurrentSessionId(newSession._id)
        sessionId = newSession._id
      } catch (err: any) {
        console.error('Failed to create session:', err)
        setError('Failed to create chat session')
        return
      }
    }

    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Add placeholder assistant message for streaming
    const assistantMessageId = `assistant-${Date.now()}`
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    setMessages((prev) => [...prev, assistantMessage])

    setIsLoading(true)
    setError(null)

    try {
      // Use streaming API with sessionId
      await qaService.askQuestionStream(
        { contentId, question, sessionId } as any,
        {
          onToken: (token) => {
            // Update streaming message with new token
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + token }
                  : msg
              )
            )
          },
          onComplete: (data) => {
            // Finalize message with source segments
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      isStreaming: false,
                      sourceSegments: data.sourceSegments,
                      timestamp: data.createdAt,
                    }
                  : msg
              )
            )

            // Update session metadata
            if (sessionId && sessions.length > 0) {
              setSessions((prev) =>
                prev.map((s) =>
                  s._id === sessionId
                    ? {
                        ...s,
                        lastMessageAt: new Date(data.createdAt),
                        messageCount: s.messageCount + 2,
                      }
                    : s
                )
              )
            }

            // Start cooldown (30 seconds)
            setCooldown(30)

            // Generate follow-up questions
            const lastUserMessage = messages[messages.length - 1]?.content || question
            const answer = messages.find((m) => m.id === assistantMessageId)?.content || ''
            if (answer) {
              loadFollowUpQuestions(lastUserMessage, answer)
            }

            // Refresh user info to update quota
            authService.getCurrentUser().then(setUserInfo).catch(console.error)
          },
          onError: (errorMsg) => {
            setConnectionStatus('disconnected')
            setRetryCount(prev => prev + 1)
            setError(errorMsg)
            // Remove streaming message on error
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId))
          },
        }
      )
      // Mark connection as working
      setConnectionStatus('connected')
      setRetryCount(0)
    } catch (err: any) {
      console.error('Failed to ask question:', err)
      setConnectionStatus('disconnected')
      setRetryCount(prev => prev + 1)
      setError(err.message || 'Failed to ask question')
      // Remove streaming message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId))
    } finally {
      setIsLoading(false)
    }
  }

  const loadFollowUpQuestions = async (question: string, answer: string) => {
    try {
      const questions = await qaService.getFollowUpQuestions(question, answer)
      setFollowUpQuestions(questions)
    } catch (err) {
      console.error('Failed to load follow-up questions:', err)
    }
  }

  const handleFollowUpClick = (question: string) => {
    handleAskQuestion(question)
    setFollowUpQuestions([])
  }

  const handleRetry = () => {
    setError(null)
    setConnectionStatus('checking')
    // Try to reconnect by fetching user info
    authService.getCurrentUser()
      .then((user) => {
        setUserInfo(user)
        setConnectionStatus('connected')
        setRetryCount(0)
      })
      .catch(() => {
        setConnectionStatus('disconnected')
      })
  }

  const handleTimestampClick = (startTime: number) => {
    if (content?.sourceUrl) {
      // For YouTube videos, navigate to specific timestamp
      const videoId = new URL(content.sourceUrl).searchParams.get('v')
      if (videoId) {
        const seconds = Math.floor(startTime / 1000)
        window.open(`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`, '_blank')
      }
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all Q&A history for this content?')) return

    try {
      const qaIds = messages
        .filter((msg) => msg.type === 'assistant' && msg.id.startsWith('assistant-'))
        .map((msg) => msg.id.replace('assistant-', ''))
        .filter((id) => id.length === 24) // Valid MongoDB ObjectId length

      if (qaIds.length > 0) {
        await qaService.bulkDeleteQA(qaIds)
      }
      
      setMessages([])
      setFollowUpQuestions([])
      setError(null)
    } catch (err: any) {
      console.error('Failed to clear history:', err)
      alert('Failed to clear history: ' + (err.message || 'Unknown error'))
    }
  }

  const handleExportChat = () => {
    const chatText = messages
      .map((msg) => {
        const prefix = msg.type === 'user' ? 'Q:' : 'A:'
        return `${prefix} ${msg.content}\n`
      })
      .join('\n')

    const blob = new Blob([chatText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${content?.title || 'export'}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getRemainingQuestions = () => {
    return undefined // Unlimited questions for all users
  }

  if (isLoadingHistory || isLoadingSessions) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 flex relative">
      {/* Skip to main content - for screen readers */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsSidebarOpen(false)
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar overlay"
        />
      )}

      {/* Chat Session Sidebar */}
      <div className={`
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        fixed lg:static top-0 left-0 h-full z-50 lg:z-auto
        transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'lg:block' : 'hidden lg:block'}
      `}>
        <ChatSessionSidebarEnhanced
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSessionSelect={(sessionId) => {
            handleSessionSelect(sessionId)
            // Auto-close sidebar on mobile after selection
            if (window.innerWidth < 1024) {
              setIsSidebarOpen(false)
            }
          }}
          onNewSession={() => {
            handleNewSession()
            if (window.innerWidth < 1024) {
              setIsSidebarOpen(false)
            }
          }}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onGenerateAITitle={handleGenerateAITitle}
          onTogglePin={handleTogglePin}
          onShareSession={handleShareSession}
          onExportSession={handleExportSession}
          onViewAnalytics={handleViewAnalytics}
          isLoading={isLoadingSessions}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
      {/* Enhanced Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              {/* Enhanced Sidebar Toggle */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 sm:p-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 rounded-xl transition-all duration-200 hover-lift focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                aria-expanded={isSidebarOpen}
              >
                {isSidebarOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <Link
                to={`/content/${contentId}`}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 rounded-xl transition-all duration-200 hover-lift flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                title="Back to content"
                aria-label="Back to content"
              >
                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </Link>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                      {content?.title || 'Q&A Chat'}
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">
                      Ask questions and get AI-powered answers with source references
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {/* Connection Status Indicator */}
              {connectionStatus === 'disconnected' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span>Offline</span>
                  <button
                    onClick={handleRetry}
                    className="ml-1 text-red-600 hover:text-red-800 underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              
              {userInfo?.subscription?.tier === 'free' && (
                <Link
                  to="/pricing"
                  className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-sm rounded-lg hover:shadow-lg transition"
                >
                  <Crown className="w-4 h-4" />
                  Upgrade
                </Link>
              )}
              
              <button
                onClick={handleExportChat}
                disabled={messages.length === 0}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export chat"
              >
                <Download className="w-5 h-5" />
              </button>

              <button
                onClick={handleClearHistory}
                disabled={messages.length === 0}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear history"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Enhanced Chat Container */}
      <main id="main-content" className="flex-1 overflow-hidden flex flex-col">
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ height: 'calc(100vh - 250px)' }}
        >
          <div className="container mx-auto px-4 sm:px-6 py-6 max-w-4xl">
            {/* Enhanced Empty State */}
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="relative inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-6 shadow-lg">
                  <Sparkles className="w-10 h-10 text-white" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                  Start a Conversation
                </h2>
                <p className="text-gray-600 max-w-lg mx-auto mb-8 text-base">
                  Ask questions about <span className="font-semibold text-gray-800">"{content?.title}"</span> and get detailed answers with timestamps
                  linking back to the source material.
                </p>
                
                {/* Quick suggestion buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {[
                    "What are the main topics covered?",
                    "Can you summarize this content?",
                    "What are the key takeaways?",
                    "Explain the most important concepts"
                  ].map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleFollowUpClick(suggestion)}
                      className="relative group w-full text-left p-4 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border border-blue-200/50 hover:border-blue-300 rounded-2xl transition-all duration-200 hover-lift overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      aria-label={`Ask: ${suggestion}`}
                    >
                      <div className="relative z-10">
                        <p className="text-sm font-medium text-blue-900 group-hover:text-blue-800 leading-relaxed">
                          💭 {suggestion}
                        </p>
                      </div>
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-100/50 to-transparent rounded-full -translate-y-8 translate-x-8"></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                type={message.type}
                content={message.content}
                timestamp={message.timestamp}
                sourceSegments={message.sourceSegments}
                isStreaming={message.isStreaming}
                onTimestampClick={handleTimestampClick}
                contentType={content?.type === 'youtube' ? 'youtube' : 'document'}
              />
            ))}

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-800 font-medium">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  
                  {/* Actionable help based on error type */}
                  {error.includes('connect to server') && (
                    <div className="mt-2 text-xs text-red-600">
                      💡 <strong>Troubleshooting:</strong>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                        <li>Check if the backend server is running on port 3001</li>
                        <li>Verify your internet connection</li>
                        <li>Try refreshing the page</li>
                      </ul>
                    </div>
                  )}
                  
                  {error.includes('endpoint not found') && (
                    <div className="mt-2 text-xs text-red-600">
                      💡 <strong>Troubleshooting:</strong> The Q&A feature may not be properly configured. Please contact support.
                    </div>
                  )}
                  
                  {retryCount > 0 && retryCount < 3 && (
                    <button
                      onClick={handleRetry}
                      className="mt-2 text-xs text-red-700 hover:text-red-900 underline font-medium"
                    >
                      Try reconnecting
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Follow-up Questions */}
            {followUpQuestions.length > 0 && !isLoading && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">
                    Suggested Follow-up Questions
                  </span>
                </div>
                <div className="space-y-2">
                  {followUpQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleFollowUpClick(question)}
                      className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition group"
                    >
                      <p className="text-sm text-blue-900 group-hover:text-blue-700">
                        {question}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Chat Input - Fixed at bottom */}
        <div className="flex-shrink-0">
          <ChatInput
            onSend={handleAskQuestion}
            isLoading={isLoading}
            disabled={content?.status !== 'completed'}
            cooldownSeconds={cooldown}
            remainingQuestions={getRemainingQuestions()}
            maxQuestions={10}
          />
        </div>
      </main>
      </div>
      {/* End Main Chat Area */}
    </div>
  )
}

export default QA
