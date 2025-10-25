import { useContents } from '../hooks/useContent'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ContentDeleteButton } from '../components/DeleteComponents'
import { ProcessingStatusCompact } from '../components/ProcessingStatus'
import { Trash2, Play, AlertCircle } from 'lucide-react'
import { contentService } from '../services/content.service'
import { useState } from 'react'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const { data: contentsData, isLoading, refetch } = useContents()
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set())

  const handleResumeProcessing = async (contentId: string) => {
    try {
      setResumingIds(prev => new Set(prev).add(contentId))
      await contentService.resumeProcessing(contentId)
      // Refetch to get updated status
      setTimeout(() => {
        refetch()
        setResumingIds(prev => {
          const next = new Set(prev)
          next.delete(contentId)
          return next
        })
      }, 1000)
    } catch (error) {
      console.error('Failed to resume processing:', error)
      setResumingIds(prev => {
        const next = new Set(prev)
        next.delete(contentId)
        return next
      })
      alert('Failed to resume processing. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-600">Study Buddy</h1>
            <p className="text-sm text-gray-600">Welcome back, {user?.name}!</p>
          </div>
          <div className="flex gap-4">
            <Link
              to="/deleted-items"
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Deleted Items
            </Link>
            <Link
              to="/upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Upload Content
            </Link>
            <button
              onClick={() => logout()}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
          <p className="text-gray-600">Manage your learning materials and track your progress</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Total Contents</h3>
            <p className="text-3xl font-bold text-blue-600">
              {contentsData?.data?.contents?.length || 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Paused</h3>
            <p className="text-3xl font-bold text-orange-600">
              {contentsData?.data?.contents?.filter(c => c.status === 'paused').length || 0}
            </p>
            {contentsData?.data?.contents?.some(c => c.status === 'paused') && (
              <p className="text-xs text-orange-600 mt-1">Quota limit reached</p>
            )}
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Flashcards Due</h3>
            <p className="text-3xl font-bold text-green-600">0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Study Time</h3>
            <p className="text-3xl font-bold text-purple-600">0h</p>
          </div>
        </div>

        {/* Content List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h3 className="text-xl font-bold text-gray-900">Your Content</h3>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center text-gray-600">Loading...</div>
          ) : contentsData?.data?.contents?.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 mb-4">No content yet. Upload your first material to get started!</p>
              <Link
                to="/upload"
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Upload Now
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {contentsData?.data?.contents?.map((content) => (
                <div
                  key={content._id}
                  className="p-6 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start gap-4">
                    <Link
                      to={`/content/${content._id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <h4 className="text-lg font-semibold text-gray-900 mb-1 hover:text-blue-600">
                        {content.title}
                      </h4>
                      <p className="text-sm text-gray-600 mb-2">{content.description}</p>
                      <div className="flex gap-2 mb-3">
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                          {content.type}
                        </span>
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded ${
                            content.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : content.status === 'processing'
                              ? 'bg-yellow-100 text-yellow-700'
                              : content.status === 'paused'
                              ? 'bg-orange-100 text-orange-700'
                              : content.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {content.status}
                        </span>
                      </div>

                      {/* Paused Status Warning */}
                      {content.status === 'paused' && content.metadata?.quotaInfo && (
                        <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-orange-800 mb-1">
                                Processing Paused - Quota Limit Reached
                              </p>
                              <p className="text-orange-700 text-xs">
                                {content.metadata.quotaInfo.suggestedAction || 
                                 'API quota exceeded. Please wait for quota reset or upgrade your plan.'}
                              </p>
                              {content.metadata.quotaInfo.estimatedRecoveryTime && (
                                <p className="text-orange-600 text-xs mt-1">
                                  ⏰ Estimated recovery: {new Date(content.metadata.quotaInfo.estimatedRecoveryTime).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Processing Status */}
                      <ProcessingStatusCompact content={content} />
                    </Link>
                    <div className="flex items-start gap-3">
                      {/* Resume Button for Paused Content */}
                      {content.status === 'paused' && (
                        <button
                          onClick={() => handleResumeProcessing(content._id)}
                          disabled={resumingIds.has(content._id)}
                          className="bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                          title="Resume processing"
                        >
                          <Play className="w-3 h-3" />
                          {resumingIds.has(content._id) ? 'Resuming...' : 'Resume'}
                        </button>
                      )}
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(content.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ContentDeleteButton
                        contentId={content._id}
                        contentTitle={content.title}
                        onDeleteSuccess={() => refetch()}
                        size="sm"
                        showText={false}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Dashboard
