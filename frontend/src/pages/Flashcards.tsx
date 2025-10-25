import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Brain, TrendingUp, Clock, Target, RefreshCw } from 'lucide-react'
import { flashcardService, Flashcard } from '../services/flashcard.service'
import { contentService, Content as ContentType } from '../services/content.service'
import { FlashcardViewer } from '../components/FlashcardViewer'

const Flashcards = () => {
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [allFlashcards, setAllFlashcards] = useState<Flashcard[]>([]) // Store all cards for stats
  const [content, setContent] = useState<ContentType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'all' | 'due'>('all')

  // Calculate content-specific statistics from ALL flashcards for this content
  const statistics = (() => {
    const cardsToUse = allFlashcards.length > 0 ? allFlashcards : flashcards
    if (cardsToUse.length === 0) {
      return {
        total: 0,
        dueToday: 0,
        mastered: 0,
        averageAccuracy: 0
      }
    }

    const now = new Date()
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const total = cardsToUse.length
    const dueToday = cardsToUse.filter(
      f => new Date(f.spacedRepetition.nextReviewDate) <= endOfDay
    ).length
    const mastered = cardsToUse.filter(
      f => f.spacedRepetition.repetitions >= 5 && f.spacedRepetition.interval >= 30
    ).length

    const totalReviewed = cardsToUse.reduce((sum, f) => sum + f.statistics.timesReviewed, 0)
    const totalCorrect = cardsToUse.reduce((sum, f) => sum + f.statistics.timesCorrect, 0)
    const averageAccuracy = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100 * 10) / 10 : 0

    return {
      total,
      dueToday,
      mastered,
      averageAccuracy
    }
  })()

  useEffect(() => {
    fetchFlashcards()
    if (contentId) {
      fetchContent()
    }
  }, [contentId, mode])

  const fetchContent = async () => {
    if (!contentId) return

    try {
      const response = await contentService.getContentById(contentId)
      setContent(response.data.content)
    } catch (err: any) {
      console.error('Error fetching content:', err)
    }
  }

  const fetchFlashcards = async () => {
    if (!contentId) return

    try {
      setIsLoading(true)
      setError(null)

      // Always fetch all flashcards for statistics
      const allCardsResponse = await flashcardService.getFlashcards(contentId)
      setAllFlashcards(allCardsResponse.data.flashcards)

      // Fetch the appropriate cards based on mode
      const response = mode === 'all'
        ? allCardsResponse
        : await flashcardService.getDueFlashcards()

      // Filter by contentId if in due mode
      const cards = mode === 'due'
        ? response.data.flashcards.filter((f: Flashcard) => f.contentId === contentId)
        : response.data.flashcards

      setFlashcards(cards)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load flashcards')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReview = async (flashcardId: string, quality: number, responseTime: number) => {
    try {
      await flashcardService.reviewFlashcard(flashcardId, quality, responseTime)
      // Refresh flashcards to get updated data
      await fetchFlashcards()
    } catch (err: any) {
      console.error('Error reviewing flashcard:', err)
      throw err
    }
  }

  const handleReset = async (flashcardId: string) => {
    try {
      await flashcardService.resetFlashcard(flashcardId)
      // Refresh flashcards
      await fetchFlashcards()
    } catch (err: any) {
      console.error('Error resetting flashcard:', err)
      throw err
    }
  }

  // Calculate due count locally from fetched flashcards for this specific content
  const dueCount = (() => {
    const now = new Date()
    return flashcards.filter(f => new Date(f.spacedRepetition.nextReviewDate) <= now).length
  })()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading flashcards...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Flashcards</h2>
          <p className="text-gray-600 mb-6">{error}</p>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to={contentId ? `/content/${contentId}` : '/dashboard'}
                className="text-gray-600 hover:text-gray-900 transition"
              >
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Brain className="w-7 h-7 text-blue-600" />
                  Flashcards
                </h1>
                {content && (
                  <p className="text-gray-600 mt-1">{content.title}</p>
                )}
              </div>
            </div>

            <button
              onClick={fetchFlashcards}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Statistics Dashboard */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Cards</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{statistics.total}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Brain className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Due Today</p>
                  <p className="text-3xl font-bold text-orange-600 mt-2">{statistics.dueToday}</p>
                </div>
                <div className="bg-orange-100 p-3 rounded-lg">
                  <Clock className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Mastered</p>
                  <p className="text-3xl font-bold text-green-600 mt-2">{statistics.mastered}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Accuracy</p>
                  <p className="text-3xl font-bold text-purple-600 mt-2">{statistics.averageAccuracy}%</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Target className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg shadow p-1 inline-flex">
            <button
              onClick={() => setMode('all')}
              className={`px-6 py-2 rounded-md font-medium transition ${
                mode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              All Cards ({statistics?.total || 0})
            </button>
            <button
              onClick={() => setMode('due')}
              className={`px-6 py-2 rounded-md font-medium transition ${
                mode === 'due'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Due for Review ({dueCount})
            </button>
          </div>
        </div>

        {/* Flashcard Viewer */}
        {flashcards.length > 0 ? (
          <FlashcardViewer
            flashcards={flashcards}
            onReview={handleReview}
            onReset={handleReset}
            sourceUrl={content?.sourceUrl}
          />
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-6xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {mode === 'due' ? 'No Cards Due for Review' : 'No Flashcards Available'}
            </h3>
            <p className="text-gray-600 mb-6">
              {mode === 'due'
                ? "Great job! You're all caught up. Check back later for more reviews."
                : 'Flashcards will be generated automatically when content processing is complete.'}
            </p>
            {mode === 'due' && statistics && statistics.total > 0 && (
              <button
                onClick={() => setMode('all')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                View All Cards
              </button>
            )}
          </div>
        )}

        {/* Learning Tips */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">💡 Study Tips</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li>• Use <kbd className="px-2 py-1 bg-white rounded text-xs">Space</kbd> to flip cards</li>
            <li>• Rate honestly (0-5) for optimal spaced repetition</li>
            <li>• Cards rated 3+ will appear less frequently</li>
            <li>• Cards rated 0-2 will reset and appear more often</li>
            <li>• Click timestamps to jump to the source in the video</li>
            <li>• Review due cards daily for best retention</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

export default Flashcards
