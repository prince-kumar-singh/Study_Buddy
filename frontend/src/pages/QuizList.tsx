import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { quizService } from '../services/quiz.service';
import { contentService } from '../services/content.service';
import { Quiz, Content } from '../types';
import { 
  Brain, 
  Plus, 
  Clock, 
  CheckCircle, 
  ArrowLeft,
  BookOpen,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function QuizList() {
  const { contentId } = useParams<{ contentId: string }>();
  const navigate = useNavigate();

  const [content, setContent] = useState<Content | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [autoChecking, setAutoChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');

  useEffect(() => {
    loadData();
  }, [contentId]);

  const loadData = async () => {
    if (!contentId) return;

    try {
      setLoading(true);
      const [contentData, quizzesData] = await Promise.all([
        contentService.getContentById(contentId),
        quizService.getQuizzesByContent(contentId)
      ]);
      setContent(contentData.data.content);
      setQuizzes(quizzesData);

      // Auto-check if processing is completed but no quizzes found
      if (contentData.data.content.status === 'completed' && quizzesData.length === 0) {
        await handleAutoGenerate();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!contentId || autoChecking) return;

    try {
      setAutoChecking(true);
      setError(null);

      const result = await quizService.ensureQuizzesExist(contentId);
      
      if (!result.existed && result.quizzes.length > 0) {
        setQuizzes(result.quizzes);
        // Show success message
        setError(null);
      }
    } catch (err: any) {
      console.error('Auto-generate failed:', err);
      // Don't show error to user, just log it
    } finally {
      setAutoChecking(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!contentId) return;

    try {
      setGenerating(true);
      setError(null);
      const newQuiz = await quizService.generateQuiz(contentId, selectedDifficulty);
      
      // Navigate directly to the new quiz
      navigate(`/quiz/${newQuiz._id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate quiz');
      setGenerating(false);
    }
  };

  const handleRegenerateQuiz = async (quizId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      setRegenerating(quizId);
      setError(null);
      
      const newQuiz = await quizService.regenerateQuiz(quizId);
      
      // Update the quizzes list
      setQuizzes(prevQuizzes => 
        prevQuizzes.map(q => q._id === quizId ? newQuiz : q)
      );
      
      // Navigate to the new quiz
      navigate(`/quiz/${newQuiz._id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate quiz');
    } finally {
      setRegenerating(null);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to={`/content/${contentId}`}
            className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Content
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Quizzes
              </h1>
              {content && (
                <div className="flex items-center text-gray-600">
                  <BookOpen className="w-4 h-4 mr-2" />
                  <span>{content.title}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Generate New Quiz */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
                <Brain className="w-6 h-6 mr-2 text-purple-600" />
                Generate New Quiz
              </h2>
              <p className="text-gray-600 mb-4">
                Create a new quiz with AI-generated questions based on your content
              </p>

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Difficulty
                  </label>
                  <div className="flex gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setSelectedDifficulty(level)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          selectedDifficulty === level
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerateQuiz}
                  disabled={generating}
                  className="ml-auto px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2" />
                      Generate Quiz
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Existing Quizzes */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Available Quizzes ({quizzes.length})
          </h2>

          {quizzes.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {autoChecking ? 'Preparing your quizzes...' : 'No quizzes yet'}
              </h3>
              <p className="text-gray-600 mb-6">
                {autoChecking ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600 mr-2"></div>
                    Generating your first quiz automatically...
                  </span>
                ) : content?.status === 'completed' ? (
                  'Your quiz is being prepared. Click "Generate Quiz" above if you\'d like to create one manually.'
                ) : (
                  'Complete content processing first, then generate your first quiz!'
                )}
              </p>
              {content?.status !== 'completed' && (
                <div className="flex items-center justify-center text-sm text-amber-600 bg-amber-50 rounded-lg p-3 max-w-md mx-auto">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>Quiz generation requires completed content processing</span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {quizzes.map((quiz) => (
                <div
                  key={quiz._id}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {quiz.title}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(quiz.difficulty)}`}>
                          {quiz.difficulty}
                        </span>
                        {quiz.version && quiz.version > 1 && (
                          <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            v{quiz.version}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      <span>{quiz.questions.length} Questions</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>Created {formatDate(quiz.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/quiz/${quiz._id}`}
                      className="flex-1 px-4 py-2 bg-purple-600 text-white text-center rounded-lg hover:bg-purple-700 transition font-semibold"
                    >
                      Start Quiz
                    </Link>
                    <button
                      onClick={(e) => handleRegenerateQuiz(quiz._id, e)}
                      disabled={regenerating === quiz._id}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Regenerate quiz with new questions"
                    >
                      {regenerating === quiz._id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700"></div>
                      ) : (
                        <RefreshCw className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
