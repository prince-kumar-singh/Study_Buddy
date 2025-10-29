import { useState, memo } from 'react'
import { Copy, Check, ExternalLink, Clock, User, Bot, Sparkles } from 'lucide-react'

interface SourceSegment {
  startTime: number
  endTime: number
  relevance: number
}

interface ChatMessageProps {
  type: 'user' | 'assistant'
  content: string
  timestamp?: string
  sourceSegments?: SourceSegment[]
  isStreaming?: boolean
  onTimestampClick?: (startTime: number) => void
  contentType?: 'youtube' | 'document' // Add content type to know if timestamps are clickable
}

export const ChatMessage = memo(({
  type,
  content,
  timestamp,
  sourceSegments,
  isStreaming,
  onTimestampClick,
  contentType = 'youtube', // Default to youtube for backward compatibility
}: ChatMessageProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (type === 'user') {
    return (
      <div className="flex justify-end mb-6 group">
        <div className="max-w-[80%] flex items-start gap-3">
          <div className="flex-1">
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl rounded-tr-lg px-5 py-4 shadow-lg hover:shadow-xl transition-all duration-300 hover-lift">
              <div className="relative z-10">
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{content}</p>
              </div>
              {/* Subtle gradient overlay */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/10 to-transparent rounded-full -translate-y-8 translate-x-8"></div>
            </div>
            {timestamp && (
              <p className="text-xs text-gray-500 mt-2 text-right opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {formatTimestamp(timestamp)}
              </p>
            )}
          </div>
          {/* Enhanced User Avatar */}
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg ring-2 ring-blue-100">
            <User className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-6 group">
      <div className="max-w-[85%] flex items-start gap-3">
        {/* Enhanced AI Avatar */}
        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-emerald-100">
          <Bot className="w-5 h-5 text-white" />
        </div>
        
        <div className="flex-1">
          <div className="relative overflow-hidden bg-gradient-to-br from-white via-gray-50/50 to-gray-100/50 backdrop-blur-sm border border-gray-200/50 rounded-2xl rounded-tl-lg px-5 py-4 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift">
            {/* Sparkle indicator for AI */}
            <div className="absolute top-3 right-3 opacity-60">
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </div>
            
            {/* Message Content */}
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">
                {content}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse rounded-full"></span>
                )}
              </p>
            </div>

            {/* Source Segments - Only show for video content */}
          {sourceSegments && sourceSegments.length > 0 && !isStreaming && contentType === 'youtube' && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-600">Relevant Video Segments</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sourceSegments.map((segment, index) => (
                  <button
                    key={index}
                    onClick={() => onTimestampClick?.(segment.startTime)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded-md transition group"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {formatTime(segment.startTime)}
                    <span className="text-gray-400 group-hover:text-blue-600">→</span>
                    {formatTime(segment.endTime)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              {timestamp && (
                <span className="text-xs text-gray-500">{formatTimestamp(timestamp)}</span>
              )}
            </div>
            {!isStreaming && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition"
                title="Copy answer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            )}
          </div>
          
          {timestamp && (
            <p className="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {formatTimestamp(timestamp)}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  )
})
