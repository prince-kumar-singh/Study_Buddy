import { useState } from 'react'
import { FileText, Clock, Zap, BookOpen, Copy, Check } from 'lucide-react'

interface Summary {
  _id: string
  contentId: string
  type: 'quick' | 'brief' | 'detailed'
  content: string
  keyPoints: string[]
  topics: string[]
  metadata: {
    wordCount: number
    generationTime: number
    model: string
  }
  createdAt: string
  updatedAt: string
}

interface SummaryDisplayProps {
  summaries: Summary[]
  isLoading?: boolean
}

export const SummaryDisplay = ({ summaries, isLoading }: SummaryDisplayProps) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'brief' | 'detailed'>('brief')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Find the summary for the active tab
  const activeSummary = summaries.find(s => s.type === activeTab)

  // Check which summaries are available
  const hasQuick = summaries.some(s => s.type === 'quick')
  const hasBrief = summaries.some(s => s.type === 'brief')
  const hasDetailed = summaries.some(s => s.type === 'detailed')

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getTabIcon = (type: 'quick' | 'brief' | 'detailed') => {
    switch (type) {
      case 'quick':
        return <Zap className="w-4 h-4" />
      case 'brief':
        return <FileText className="w-4 h-4" />
      case 'detailed':
        return <BookOpen className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center text-gray-600 mt-4">Loading summaries...</p>
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600">No summaries available yet</p>
        <p className="text-sm text-gray-500 mt-2">
          Summaries will appear once the content is fully processed
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-1 p-4">
          {hasQuick && (
            <button
              onClick={() => setActiveTab('quick')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'quick'
                  ? 'bg-yellow-50 border-2 border-yellow-500 text-yellow-700'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {getTabIcon('quick')}
              Quick
            </button>
          )}
          {hasBrief && (
            <button
              onClick={() => setActiveTab('brief')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'brief'
                  ? 'bg-blue-50 border-2 border-blue-500 text-blue-700'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {getTabIcon('brief')}
              Brief
            </button>
          )}
          {hasDetailed && (
            <button
              onClick={() => setActiveTab('detailed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'detailed'
                  ? 'bg-purple-50 border-2 border-purple-500 text-purple-700'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {getTabIcon('detailed')}
              Detailed
            </button>
          )}
        </div>
      </div>

      {/* Summary Content */}
      {activeSummary ? (
        <div className="p-6">
          {/* Summary Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                <span>{activeSummary.metadata.wordCount} words</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{(activeSummary.metadata.generationTime / 1000).toFixed(1)}s</span>
              </div>
            </div>
            <button
              onClick={() => handleCopy(activeSummary.content, activeSummary._id)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              {copiedId === activeSummary._id ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Summary Text */}
          <div className="prose max-w-none mb-6">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {activeSummary.content}
            </p>
          </div>

          {/* Topics */}
          {activeSummary.topics && activeSummary.topics.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Topics:</h4>
              <div className="flex flex-wrap gap-2">
                {activeSummary.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Points */}
          {activeSummary.keyPoints && activeSummary.keyPoints.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Key Points:</h4>
              <ul className="space-y-2">
                {activeSummary.keyPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-2 text-gray-700">
                    <span className="text-blue-600 font-bold mt-1">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
            Generated with {activeSummary.metadata.model} • 
            {new Date(activeSummary.createdAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="text-gray-600">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} summary not available
          </p>
        </div>
      )}
    </div>
  )
}
