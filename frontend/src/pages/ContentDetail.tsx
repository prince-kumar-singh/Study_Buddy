import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { contentService, Content as ContentType } from '../services/content.service'
import { ProcessingStatus } from '../components/ProcessingStatus'

const Content = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [content, setContent] = useState<ContentType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchContent = async () => {
    if (!id) return

    try {
      setIsLoading(true)
      setError(null)
      const response = await contentService.getContentById(id)
      setContent(response.data.content)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load content')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchContent()
  }, [id])

  const handleResume = () => {
    // Refresh content after resume is triggered
    setTimeout(() => {
      fetchContent()
    }, 2000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading content...</p>
        </div>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Content</h2>
          <p className="text-gray-600 mb-6">{error || 'Content not found'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{content.title}</h1>
              {content.description && (
                <p className="text-gray-600 mt-1">{content.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Processing Status */}
          <div className="lg:col-span-2">
            <ProcessingStatus content={content} onResume={handleResume} />
          </div>

          {/* Right Column - Content Info */}
          <div className="space-y-6">
            {/* Content Details Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Details</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Type</dt>
                  <dd className="mt-1">
                    <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded uppercase">
                      {content.type}
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded uppercase font-medium ${
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
                      {content.status}
                    </span>
                  </dd>
                </div>

                {content.sourceUrl && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Source</dt>
                    <dd className="mt-1">
                      <a
                        href={content.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                      >
                        View Original
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(content.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(content.updatedAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>

                {content.tags && content.tags.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-2">Tags</dt>
                    <dd className="flex flex-wrap gap-2">
                      {content.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Quick Actions Card */}
            {content.status === 'completed' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Link
                    to={`/flashcards/${content._id}`}
                    className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition"
                  >
                    View Flashcards
                  </Link>
                  <Link
                    to={`/quizzes/${content._id}`}
                    className="block w-full px-4 py-2 bg-purple-600 text-white text-center rounded-lg hover:bg-purple-700 transition"
                  >
                    Take Quiz
                  </Link>
                  <Link
                    to={`/qa/${content._id}`}
                    className="block w-full px-4 py-2 bg-green-600 text-white text-center rounded-lg hover:bg-green-700 transition"
                  >
                    Ask Questions
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Content
