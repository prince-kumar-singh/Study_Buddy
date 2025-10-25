import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { quizService } from '../services/quiz.service';
import { Quiz, QuizAttempt, QuizQuestion, QuizSubmission } from '../types';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  Send,
  Award,
  TrendingUp,
  TrendingDown,
  Target
} from 'lucide-react';

interface QuizAnswer {
  questionIndex: number;
  userAnswer: string | string[];
  timeSpent: number;
}

export default function TakeQuiz() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, QuizAnswer>>(new Map());
  const [currentAnswer, setCurrentAnswer] = useState<string | string[]>('');
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load quiz and start attempt
  useEffect(() => {
    const loadQuiz = async () => {
      if (!quizId) {
        setError('Quiz ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const quizData = await quizService.getQuiz(quizId);
        setQuiz(quizData);

        // Start attempt
        const attemptData = await quizService.startQuizAttempt(quizId);
        setAttempt(attemptData);
        
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load quiz');
        setLoading(false);
      }
    };

    loadQuiz();
  }, [quizId]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (value: string) => {
    setCurrentAnswer(value);
  };

  const handleMultipleChoiceChange = (option: string) => {
    const currentQuestion = quiz?.questions[currentQuestionIndex];
    if (currentQuestion?.type === 'mcq') {
      setCurrentAnswer(option);
    }
  };

  const saveCurrentAnswer = useCallback(() => {
    if (!currentAnswer) return;

    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestionIndex, {
      questionIndex: currentQuestionIndex,
      userAnswer: currentAnswer,
      timeSpent,
    });
    setAnswers(newAnswers);
  }, [currentAnswer, currentQuestionIndex, questionStartTime, answers]);

  const handleNext = () => {
    saveCurrentAnswer();
    
    if (quiz && currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setCurrentAnswer(answers.get(currentQuestionIndex + 1)?.userAnswer || '');
      setQuestionStartTime(Date.now());
    }
  };

  const handlePrevious = () => {
    saveCurrentAnswer();
    
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setCurrentAnswer(answers.get(currentQuestionIndex - 1)?.userAnswer || '');
      setQuestionStartTime(Date.now());
    }
  };

  const handleSubmit = async () => {
    if (!attempt || !quiz) return;

    // Save current answer
    saveCurrentAnswer();

    // Confirm submission
    if (!window.confirm(`Are you sure you want to submit? You have answered ${answers.size} out of ${quiz.questions.length} questions.`)) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const submission: QuizSubmission = {
        answers: Array.from(answers.values()),
      };

      const result = await quizService.submitQuiz(attempt._id, submission);
      setResults(result);
      setShowResults(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: QuizQuestion) => {
    switch (question.type) {
      case 'mcq':
        return (
          <div className="space-y-3">
            {question.options?.map((option, index) => (
              <label
                key={index}
                className="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-blue-500 hover:bg-blue-50"
              >
                <input
                  type="radio"
                  name="answer"
                  value={option}
                  checked={currentAnswer === option}
                  onChange={() => handleMultipleChoiceChange(option)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-3 text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'truefalse':
        return (
          <div className="space-y-3">
            {['True', 'False'].map((option) => (
              <label
                key={option}
                className="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-blue-500 hover:bg-blue-50"
              >
                <input
                  type="radio"
                  name="answer"
                  value={option}
                  checked={currentAnswer === option}
                  onChange={() => handleMultipleChoiceChange(option)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-3 text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'fillin':
      case 'essay':
        return (
          <textarea
            value={currentAnswer as string}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full p-4 border-2 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            rows={question.type === 'essay' ? 8 : 3}
          />
        );

      default:
        return <div>Unknown question type</div>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (showResults && results) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            {/* Results Header */}
            <div className="text-center mb-8">
              <Award className={`w-20 h-20 mx-auto mb-4 ${results.passed ? 'text-green-500' : 'text-yellow-500'}`} />
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {results.passed ? 'Congratulations!' : 'Keep Studying!'}
              </h1>
              <p className="text-xl text-gray-600">{results.feedback}</p>
            </div>

            {/* Score Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <Target className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-3xl font-bold text-blue-600">
                  {results.attempt.percentage}%
                </div>
                <div className="text-sm text-gray-600">Your Score</div>
              </div>

              <div className="bg-green-50 rounded-lg p-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-3xl font-bold text-green-600">
                  {results.attempt.performance.correctAnswers}/{quiz?.questions.length}
                </div>
                <div className="text-sm text-gray-600">Correct Answers</div>
              </div>

              <div className="bg-purple-50 rounded-lg p-6 text-center">
                <Clock className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <div className="text-3xl font-bold text-purple-600">
                  {formatTime(results.attempt.timeSpent)}
                </div>
                <div className="text-sm text-gray-600">Time Taken</div>
              </div>
            </div>

            {/* Performance Analysis */}
            {(results.attempt.performance.strongTopics.length > 0 || 
              results.attempt.performance.weakTopics.length > 0) && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Analysis</h2>
                
                {results.attempt.performance.strongTopics.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center mb-2">
                      <TrendingUp className="w-5 h-5 text-green-600 mr-2" />
                      <span className="font-semibold text-gray-900">Strong Topics</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {results.attempt.performance.strongTopics.map((topic: string) => (
                        <span key={topic} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {results.attempt.performance.weakTopics.length > 0 && (
                  <div>
                    <div className="flex items-center mb-2">
                      <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                      <span className="font-semibold text-gray-900">Topics to Review</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {results.attempt.performance.weakTopics.map((topic: string) => (
                        <span key={topic} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Suggested Next Steps */}
            {results.suggestedDifficulty && (
              <div className="bg-blue-50 rounded-lg p-6 mb-8">
                <h3 className="font-semibold text-gray-900 mb-2">Recommended Next Level</h3>
                <p className="text-gray-600">
                  Based on your performance, we recommend trying a{' '}
                  <span className="font-semibold text-blue-600 capitalize">
                    {results.suggestedDifficulty}
                  </span>{' '}
                  level quiz next time.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => navigate(`/content/${quiz?.contentId}`)}
                className="flex-1 px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold"
              >
                Back to Content
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Retake Quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!quiz) return null;

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
            <div className="flex items-center text-gray-600">
              <Clock className="w-5 h-5 mr-2" />
              <span className="font-mono text-lg">{formatTime(totalElapsedTime)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{currentQuestionIndex + 1} / {quiz.questions.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question Counter Pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  saveCurrentAnswer();
                  setCurrentQuestionIndex(index);
                  setCurrentAnswer(answers.get(index)?.userAnswer || '');
                  setQuestionStartTime(Date.now());
                }}
                className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                  index === currentQuestionIndex
                    ? 'bg-blue-600 text-white'
                    : answers.has(index)
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold capitalize">
                {currentQuestion.difficulty}
              </span>
              <span className="text-sm text-gray-600">
                {currentQuestion.points} points
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {currentQuestion.question}
            </h2>
          </div>

          {renderQuestion(currentQuestion)}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            className="flex items-center px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            Previous
          </button>

          {currentQuestionIndex === quiz.questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Submit Quiz
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Next
              <ChevronRight className="w-5 h-5 ml-2" />
            </button>
          )}
        </div>

        {/* Answer Count */}
        <div className="text-center mt-4 text-sm text-gray-600">
          {answers.size} of {quiz.questions.length} questions answered
        </div>
      </div>
    </div>
  );
}
