import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Clock, Target, ExternalLink } from 'lucide-react'

export interface Flashcard {
  _id: string
  contentId: string
  front: string
  back: string
  type: 'mcq' | 'truefalse' | 'fillin' | 'essay'
  difficulty: 'easy' | 'medium' | 'hard'
  sourceSegment: {
    startTime: number
    endTime: number
  }
  spacedRepetition: {
    repetitions: number
    interval: number
    easeFactor: number
    nextReviewDate: string
  }
  statistics: {
    timesReviewed: number
    timesCorrect: number
    timesIncorrect: number
  }
  tags: string[]
}

interface FlashcardViewerProps {
  flashcards: Flashcard[]
  onReview: (flashcardId: string, quality: number, responseTime: number) => Promise<void>
  onReset?: (flashcardId: string) => Promise<void>
  sourceUrl?: string
}

const qualityDescriptions = [
  { quality: 5, label: 'Perfect', description: 'Perfect recall', color: 'bg-green-600' },
  { quality: 4, label: 'Good', description: 'Correct after hesitation', color: 'bg-green-500' },
  { quality: 3, label: 'Fair', description: 'Correct with difficulty', color: 'bg-yellow-500' },
  { quality: 2, label: 'Hard', description: 'Incorrect but familiar', color: 'bg-orange-500' },
  { quality: 1, label: 'Wrong', description: 'Incorrect guess', color: 'bg-red-500' },
  { quality: 0, label: 'Blank', description: 'Complete blackout', color: 'bg-red-600' },
]

export const FlashcardViewer = ({ flashcards, onReview, onReset, sourceUrl }: FlashcardViewerProps) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showQualityRating, setShowQualityRating] = useState(false)
  const [startTime, setStartTime] = useState<number>(Date.now())
  const [isReviewing, setIsReviewing] = useState(false)

  const currentCard = flashcards[currentIndex]

  // Reset state when moving to next card
  useEffect(() => {
    setIsFlipped(false)
    setShowQualityRating(false)
    setStartTime(Date.now())
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (showQualityRating) {
        // Number keys 0-5 for quality rating
        if (e.key >= '0' && e.key <= '5') {
          handleQualitySubmit(parseInt(e.key))
        }
      } else {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (!isFlipped) {
            handleFlip()
          } else {
            setShowQualityRating(true)
          }
        } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
          setCurrentIndex(currentIndex - 1)
        } else if (e.key === 'ArrowRight' && currentIndex < flashcards.length - 1) {
          setCurrentIndex(currentIndex + 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentIndex, isFlipped, showQualityRating, flashcards.length])

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleQualitySubmit = async (quality: number) => {
    if (isReviewing) return
    
    setIsReviewing(true)
    try {
      const responseTime = Date.now() - startTime
      await onReview(currentCard._id, quality, responseTime)
      
      // Move to next card or loop back
      if (currentIndex < flashcards.length - 1) {
        setCurrentIndex(currentIndex + 1)
      } else {
        setCurrentIndex(0)
      }
    } catch (error) {
      console.error('Error reviewing flashcard:', error)
    } finally {
      setIsReviewing(false)
    }
  }

  const handleReset = async () => {
    if (!onReset) return
    try {
      await onReset(currentCard._id)
    } catch (error) {
      console.error('Error resetting flashcard:', error)
    }
  }

  const formatTimestamp = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700'
      case 'medium':
        return 'bg-yellow-100 text-yellow-700'
      case 'hard':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getAccuracy = () => {
    const { timesReviewed, timesCorrect } = currentCard.statistics
    if (timesReviewed === 0) return 0
    return Math.round((timesCorrect / timesReviewed) * 100)
  }

  if (flashcards.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📚</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Flashcards Available</h3>
        <p className="text-gray-600">Flashcards will be generated when content processing is complete.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            Card {currentIndex + 1} of {flashcards.length}
          </span>
          <span className="text-sm text-gray-600">
            {Math.round(((currentIndex + 1) / flashcards.length) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div className="relative perspective-1000" onClick={!showQualityRating ? handleFlip : undefined}>
        <div
          className="relative w-full min-h-[400px] cursor-pointer transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front of Card */}
          <div
            className="absolute inset-0 bg-white rounded-xl shadow-xl p-8 flex flex-col justify-between"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Card Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getDifficultyColor(currentCard.difficulty)}`}>
                  {currentCard.difficulty}
                </span>
                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 uppercase">
                  {currentCard.type}
                </span>
              </div>
              {onReset && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReset()
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Reset progress"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Front Content */}
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Question</h3>
                <p className="text-xl text-gray-700 leading-relaxed">{currentCard.front}</p>
              </div>
            </div>

            {/* Card Footer */}
            <div className="flex justify-between items-center text-sm text-gray-600 pt-6 border-t">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  <span>{getAccuracy()}% accuracy</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{currentCard.statistics.timesReviewed} reviews</span>
                </div>
              </div>
              {sourceUrl && (
                <a
                  href={`${sourceUrl}#t=${Math.floor(currentCard.sourceSegment.startTime / 1000)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{formatTimestamp(currentCard.sourceSegment.startTime)}</span>
                </a>
              )}
            </div>
          </div>

          {/* Back of Card */}
          <div
            className="absolute inset-0 bg-white rounded-xl shadow-xl p-8 flex flex-col justify-between"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            {/* Card Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getDifficultyColor(currentCard.difficulty)}`}>
                  {currentCard.difficulty}
                </span>
                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 uppercase">
                  {currentCard.type}
                </span>
              </div>
              {onReset && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReset()
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Reset progress"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Back Content */}
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Answer</h3>
                <p className="text-xl text-gray-700 leading-relaxed">{currentCard.back}</p>
              </div>
            </div>

            {/* Card Footer */}
            <div className="flex justify-between items-center text-sm text-gray-600 pt-6 border-t">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  <span>{getAccuracy()}% accuracy</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{currentCard.statistics.timesReviewed} reviews</span>
                </div>
              </div>
              {sourceUrl && (
                <a
                  href={`${sourceUrl}#t=${Math.floor(currentCard.sourceSegment.startTime / 1000)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{formatTimestamp(currentCard.sourceSegment.startTime)}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Flip Instruction */}
        {!isFlipped && !showQualityRating && (
          <div className="text-center mt-4 text-gray-600 text-sm">
            Click card or press <kbd className="px-2 py-1 bg-gray-100 rounded">Space</kbd> to reveal answer
          </div>
        )}
      </div>

      {/* Quality Rating */}
      {isFlipped && showQualityRating && (
        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">How well did you know this?</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {qualityDescriptions.map(({ quality, label, description, color }) => (
              <button
                key={quality}
                onClick={() => handleQualitySubmit(quality)}
                disabled={isReviewing}
                className={`${color} text-white p-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-2xl font-bold mb-1">{quality}</div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs opacity-90">{description}</div>
              </button>
            ))}
          </div>
          <div className="text-center mt-4 text-gray-600 text-sm">
            Press <kbd className="px-2 py-1 bg-gray-100 rounded">0-5</kbd> on keyboard
          </div>
        </div>
      )}

      {/* Rate Answer Button */}
      {isFlipped && !showQualityRating && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowQualityRating(true)}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Rate Your Answer
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </button>

        <div className="text-sm text-gray-600">
          Next review: {new Date(currentCard.spacedRepetition.nextReviewDate).toLocaleDateString()}
        </div>

        <button
          onClick={() => setCurrentIndex(Math.min(flashcards.length - 1, currentIndex + 1))}
          disabled={currentIndex === flashcards.length - 1}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Next
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Tags */}
      {currentCard.tags && currentCard.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {currentCard.tags.map((tag, index) => (
            <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
