import { useState, useRef, useEffect, KeyboardEvent, memo } from 'react'
import { Send, Loader2, AlertCircle } from 'lucide-react'

interface ChatInputProps {
  onSend: (question: string) => void
  isLoading: boolean
  disabled?: boolean
  cooldownSeconds?: number
  remainingQuestions?: number
  maxQuestions?: number
}

export const ChatInput = memo(({
  onSend,
  isLoading,
  disabled = false,
  cooldownSeconds = 0,
  remainingQuestions,
  maxQuestions,
}: ChatInputProps) => {
  const [question, setQuestion] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [cooldown, setCooldown] = useState(cooldownSeconds)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const MAX_CHARS = 500

  // Handle cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  // Update cooldown when prop changes
  useEffect(() => {
    setCooldown(cooldownSeconds)
  }, [cooldownSeconds])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [question])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= MAX_CHARS) {
      setQuestion(value)
      setCharCount(value.length)
    }
  }

  const handleSubmit = () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isLoading || disabled || cooldown > 0) return
    if (trimmedQuestion.length < 3) {
      alert('Question must be at least 3 characters long')
      return
    }

    onSend(trimmedQuestion)
    setQuestion('')
    setCharCount(0)
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isAtLimit = remainingQuestions !== undefined && remainingQuestions <= 0
  const canSend = question.trim().length >= 3 && !isLoading && !disabled && cooldown === 0 && !isAtLimit

  return (
    <div className="border-t border-gray-200/50 bg-gradient-to-r from-white via-gray-50/30 to-white backdrop-blur-sm">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-5">
        {/* Enhanced Rate Limit Warning */}
        {remainingQuestions !== undefined && maxQuestions !== undefined && (
          <div className="mb-4">
            {isAtLimit ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-orange-900 mb-1">Weekly Limit Reached</h4>
                    <p className="text-sm text-orange-800">
                      You've used all {maxQuestions} questions this week. Upgrade to premium for unlimited AI conversations!
                    </p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-100/50 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
              </div>
            ) : remainingQuestions <= 3 && (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-yellow-900 mb-1">Almost at your limit</h4>
                    <p className="text-sm text-yellow-800">
                      {remainingQuestions} question{remainingQuestions !== 1 ? 's' : ''} remaining this week. 
                      <span className="font-medium"> Consider upgrading for unlimited access!</span>
                    </p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-100/50 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 relative group">
            {/* Modern textarea with enhanced styling */}
            <textarea
              ref={textareaRef}
              value={question}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder=""
              disabled={disabled || isLoading || isAtLimit}
              rows={1}
              aria-label="Ask a question about this content"
              aria-describedby="char-counter help-text"
              className={`w-full px-4 py-4 pr-20 border-2 rounded-2xl resize-none focus:outline-none transition-all duration-300 chat-input-focus ${
                disabled || isLoading || isAtLimit
                  ? 'bg-gray-50/80 text-gray-500 cursor-not-allowed border-gray-200'
                  : 'bg-white/90 backdrop-blur-sm text-gray-900 border-gray-200 focus:border-blue-400 focus:bg-white shadow-sm focus:shadow-lg'
              } ${charCount > MAX_CHARS * 0.9 
                ? 'border-orange-400 focus:border-orange-500' 
                : charCount > MAX_CHARS * 0.7 
                ? 'border-yellow-400 focus:border-yellow-500' 
                : ''
              }`}
              style={{ 
                maxHeight: '150px', 
                minHeight: '56px',
                fontSize: '15px',
                lineHeight: '1.5'
              }}
            />
            
            {/* Floating label effect */}
            {question.length === 0 && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="flex items-center px-4 py-4 text-gray-400 transition-all duration-200 group-focus-within:text-blue-500">
                  <span className="text-sm">
                    {disabled 
                      ? '⏳ Content must be processed before asking questions...' 
                      : '✨ Ask anything about this content...'
                    }
                  </span>
                </div>
              </div>
            )}
            
            {/* Character Counter with enhanced design */}
            <div className="absolute bottom-3 right-4 flex items-center gap-2">
              {charCount > 0 && (
                <div className={`px-2 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                  charCount > MAX_CHARS * 0.9
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : charCount > MAX_CHARS * 0.7
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                  {charCount}/{MAX_CHARS}
                </div>
              )}
            </div>
            
            {/* Input border glow effect */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-sm"></div>
            </div>
          </div>

          {/* Enhanced Send Button */}
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`relative flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              canSend
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 focus:ring-blue-500'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed focus:ring-gray-400'
            }`}
            title={
              cooldown > 0
                ? `Wait ${cooldown}s before asking another question`
                : isAtLimit
                ? 'Question limit reached'
                : 'Send question (Enter)'
            }
            aria-label={
              cooldown > 0
                ? `Wait ${cooldown} seconds before asking another question`
                : isAtLimit
                ? 'Question limit reached'
                : 'Send question'
            }
          >
            {/* Button background effect */}
            {canSend && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            )}
            
            {/* Button content */}
            <div className="relative z-10">
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : cooldown > 0 ? (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold">{cooldown}</span>
                  <span className="text-xs opacity-75">sec</span>
                </div>
              ) : (
                <Send className="w-6 h-6" />
              )}
            </div>
            
            {/* Pulse effect for cooldown */}
            {cooldown > 0 && (
              <div className="absolute inset-0 rounded-2xl border-2 border-orange-400 animate-pulse"></div>
            )}
          </button>
        </div>

        {/* Enhanced Help Text */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4" id="help-text">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span>💡</span>
              <span className="hidden sm:inline">Press</span>
              <kbd className="px-2 py-1 bg-gradient-to-b from-gray-100 to-gray-200 border border-gray-300 rounded-md text-xs font-mono shadow-sm">Enter</kbd>
              <span className="hidden sm:inline">to send,</span>
              <kbd className="px-2 py-1 bg-gradient-to-b from-gray-100 to-gray-200 border border-gray-300 rounded-md text-xs font-mono shadow-sm">Shift + Enter</kbd>
              <span className="hidden sm:inline">for new line</span>
            </p>
            {!isAtLimit && remainingQuestions !== undefined && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>⚡</span>
                <span>{remainingQuestions} questions left this week</span>
              </div>
            )}
          </div>
          {cooldown > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              <p className="text-xs text-orange-700 font-medium">
                Next question in {cooldown}s
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
