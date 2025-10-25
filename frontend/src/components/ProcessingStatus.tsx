import { useState } from 'react'
import { 
  CheckCircle2, 
  Circle, 
  XCircle, 
  Loader2, 
  RefreshCw, 
  AlertCircle,
  PauseCircle
} from 'lucide-react'
import { Content, contentService } from '../services/content.service'

interface ProcessingStatusProps {
  content: Content
  onResume?: () => void
}

export const ProcessingStatus = ({ content, onResume }: ProcessingStatusProps) => {
  const [isResuming, setIsResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  const stages = [
    { key: 'transcription', label: 'Transcription', icon: '📝' },
    { key: 'vectorization', label: 'Vectorization', icon: '🧠' },
    { key: 'summarization', label: 'Summarization', icon: '📄' },
    { key: 'flashcardGeneration', label: 'Flashcards', icon: '🗂️' },
    { key: 'quizGeneration', label: 'Quizzes', icon: '❓' },
  ] as const

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'paused':
        return <PauseCircle className="w-5 h-5 text-orange-600" />
      case 'pending':
        return <Circle className="w-5 h-5 text-gray-300" />
      default:
        return <Circle className="w-5 h-5 text-gray-300" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'processing':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      case 'paused':
        return 'bg-orange-500'
      case 'pending':
        return 'bg-gray-300'
      default:
        return 'bg-gray-300'
    }
  }

  const hasFailedStage = stages.some(
    stage => content.processingStages[stage.key].status === 'failed'
  )

  const hasPausedStage = stages.some(
    stage => content.processingStages[stage.key].status === 'paused'
  )

  const isPaused = content.status === 'paused'
  const canResume = hasFailedStage || hasPausedStage || isPaused

  const handleResume = async () => {
    try {
      setIsResuming(true)
      setResumeError(null)
      await contentService.resumeProcessing(content._id)
      onResume?.()
    } catch (error: any) {
      setResumeError(error.response?.data?.message || 'Failed to resume processing')
    } finally {
      setIsResuming(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Processing Status</h3>
        {canResume && (
          <button
            onClick={handleResume}
            disabled={isResuming}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isResuming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Resuming...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Resume Processing
              </>
            )}
          </button>
        )}
      </div>

      {/* Quota Warning for Paused Content */}
      {isPaused && content.metadata?.quotaInfo && (
        <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-orange-900 mb-2">
                Processing Paused - API Quota Reached
              </h4>
              <div className="text-sm text-orange-800 space-y-1">
                <p>
                  <strong>Reason:</strong> {content.metadata.pausedReason || 'Google Gemini API quota limit reached'}
                </p>
                {content.metadata.quotaInfo.quotaMetric && (
                  <p>
                    <strong>Quota Type:</strong> {content.metadata.quotaInfo.quotaMetric}
                  </p>
                )}
                {content.metadata.quotaInfo.estimatedRecoveryTime && (
                  <p>
                    <strong>Estimated Recovery:</strong>{' '}
                    {new Date(content.metadata.quotaInfo.estimatedRecoveryTime).toLocaleString()}
                  </p>
                )}
                {content.metadata.quotaInfo.suggestedAction && (
                  <p className="mt-2 text-orange-700">
                    💡 <strong>Tip:</strong> {content.metadata.quotaInfo.suggestedAction}
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs text-orange-700">
                Your content will automatically resume processing when the quota resets, or you can try resuming manually now.
              </p>
            </div>
          </div>
        </div>
      )}

      {resumeError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{resumeError}</p>
        </div>
      )}

      <div className="space-y-4">
        {stages.map((stage, index) => {
          const stageData = content.processingStages[stage.key]
          const isFailed = stageData.status === 'failed'

          return (
            <div key={stage.key} className="relative">
              {/* Connector line */}
              {index < stages.length - 1 && (
                <div className="absolute left-[14px] top-10 w-0.5 h-8 bg-gray-200" />
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 relative z-10 bg-white">
                  {getStatusIcon(stageData.status)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{stage.icon}</span>
                      <h4 className="font-medium text-gray-900">{stage.label}</h4>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          stageData.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : stageData.status === 'processing'
                            ? 'bg-blue-100 text-blue-700'
                            : stageData.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : stageData.status === 'paused'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {stageData.status}
                      </span>
                    </div>
                    {stageData.progress > 0 && stageData.progress < 100 && (
                      <span className="text-sm text-gray-600">
                        {stageData.progress}%
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {stageData.status === 'processing' && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getStatusColor(
                          stageData.status
                        )}`}
                        style={{ width: `${stageData.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error Message */}
                  {isFailed && stageData.error && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm text-red-700">{stageData.error}</p>
                      {stageData.retryCount && stageData.retryCount > 0 && (
                        <p className="text-xs text-red-600 mt-1">
                          Retry attempts: {stageData.retryCount}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Timestamps */}
                  {(stageData.startedAt || stageData.completedAt) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {stageData.startedAt && (
                        <span>
                          Started: {new Date(stageData.startedAt).toLocaleString()}
                        </span>
                      )}
                      {stageData.completedAt && (
                        <span className="ml-3">
                          Completed: {new Date(stageData.completedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Overall Status Summary */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Overall Status</p>
            <p className="text-xs text-gray-500">
              {content.status === 'completed'
                ? 'All processing stages completed successfully'
                : content.status === 'failed'
                ? 'Processing failed - click Resume to retry'
                : content.status === 'paused'
                ? 'Processing paused - will auto-resume or click Resume'
                : content.status === 'processing'
                ? 'Processing in progress...'
                : 'Processing queued'}
            </p>
          </div>
          <div
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              content.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : content.status === 'processing'
                ? 'bg-blue-100 text-blue-700'
                : content.status === 'failed'
                ? 'bg-red-100 text-red-700'
                : content.status === 'paused'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {content.status.charAt(0).toUpperCase() + content.status.slice(1)}
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact version for dashboard list view
export const ProcessingStatusCompact = ({ content }: { content: Content }) => {
  const stages = [
    'transcription',
    'vectorization',
    'summarization',
    'flashcardGeneration',
    'quizGeneration',
  ] as const

  const completedStages = stages.filter(
    stage => content.processingStages[stage].status === 'completed'
  ).length

  const failedStages = stages.filter(
    stage => content.processingStages[stage].status === 'failed'
  ).length

  const progressPercentage = (completedStages / stages.length) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Processing Progress</span>
        <span className="text-gray-900 font-medium">
          {completedStages}/{stages.length} stages
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            failedStages > 0
              ? 'bg-red-500'
              : completedStages === stages.length
              ? 'bg-green-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      {failedStages > 0 && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{failedStages} stage(s) failed</span>
        </div>
      )}
    </div>
  )
}
