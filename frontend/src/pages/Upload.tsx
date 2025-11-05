import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { contentService } from '../services/content.service'

type UploadType = 'youtube-transcript' | 'document'

export default function Upload() {
  const navigate = useNavigate()
  const [uploadType, setUploadType] = useState<UploadType>('youtube-transcript')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Removed legacy YouTube URL upload state

  // YouTube Transcript upload state
  const [transcriptText, setTranscriptText] = useState('')
  const [transcriptTitle, setTranscriptTitle] = useState('')
  const [transcriptDescription, setTranscriptDescription] = useState('')
  const [transcriptTags, setTranscriptTags] = useState('')
  const [transcriptUrl, setTranscriptUrl] = useState('')
  const [transcriptAuthor, setTranscriptAuthor] = useState('')
  const [transcriptDuration, setTranscriptDuration] = useState('')
  const [transcriptLanguage, setTranscriptLanguage] = useState('en')

  // Document upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  // Removed legacy YouTube URL submission handler

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  const validateAndSetFile = (file: File) => {
    setError(null)

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    const allowedExtensions = ['.pdf', '.docx', '.txt']
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      setError('Invalid file type. Please upload PDF, DOCX, or TXT files only.')
      return
    }

    // Validate file size (25MB max)
    const maxSize = 25 * 1024 * 1024 // 25MB in bytes
    if (file.size > maxSize) {
      setError('File size exceeds 25MB limit. Please upload a smaller file.')
      return
    }

    setSelectedFile(file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  const handleTranscriptSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      // Validate transcript text
      if (!transcriptText.trim()) {
        throw new Error('Please enter transcript text')
      }

      await contentService.uploadTranscript({
        text: transcriptText,
        title: transcriptTitle || 'Untitled Transcript',
        description: transcriptDescription,
        tags: transcriptTags,
        url: transcriptUrl,
        author: transcriptAuthor,
        duration: transcriptDuration,
        language: transcriptLanguage
      })

      setSuccess('Transcript uploaded successfully! Processing has started.')

      // Reset form
      setTranscriptText('')
      setTranscriptTitle('')
      setTranscriptDescription('')
      setTranscriptTags('')
      setTranscriptUrl('')
      setTranscriptAuthor('')
      setTranscriptDuration('')
      setTranscriptLanguage('en')

      // Navigate to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to upload transcript')
    } finally {
      setLoading(false)
    }
  }

  const handleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!selectedFile) {
      setError('Please select a file to upload')
      return
    }

    setLoading(true)

    try {
      await contentService.uploadDocument(selectedFile)
      setSuccess('Document uploaded successfully! Processing has started.')

      // Reset form
      setSelectedFile(null)

      // Navigate to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to upload document. This feature is coming soon.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Upload Content</h1>
              <p className="text-gray-600 mt-1">Transform your learning materials into interactive study guides</p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Upload Type Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="grid grid-cols-2 border-b">
            <button
              onClick={() => setUploadType('youtube-transcript')}
              className={`py-4 px-6 text-center font-medium transition-colors ${
                uploadType === 'youtube-transcript'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              YouTube Transcript
            </button>
            <button
              onClick={() => setUploadType('document')}
              className={`py-4 px-6 text-center font-medium transition-colors ${
                uploadType === 'document'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Document (PDF/DOCX/TXT)
            </button>
          </div>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-start">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* Upload Forms */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          {uploadType === 'youtube-transcript' ? (
            <form onSubmit={handleTranscriptSubmit}>
              <div className="mb-6">
                <label htmlFor="transcriptText" className="block text-sm font-medium text-gray-700 mb-2">
                  Transcript Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="transcriptText"
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Paste your YouTube transcript text here..."
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  required
                  disabled={loading}
                  minLength={10}
                  maxLength={100000}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Paste the transcript text (10-100,000 characters). This will be processed through the same AI pipeline as YouTube videos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label htmlFor="transcriptTitle" className="block text-sm font-medium text-gray-700 mb-2">
                    Title (Optional)
                  </label>
                  <input
                    type="text"
                    id="transcriptTitle"
                    value={transcriptTitle}
                    onChange={(e) => setTranscriptTitle(e.target.value)}
                    placeholder="Video title"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={200}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="transcriptAuthor" className="block text-sm font-medium text-gray-700 mb-2">
                    Author (Optional)
                  </label>
                  <input
                    type="text"
                    id="transcriptAuthor"
                    value={transcriptAuthor}
                    onChange={(e) => setTranscriptAuthor(e.target.value)}
                    placeholder="Channel name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={100}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label htmlFor="transcriptUrl" className="block text-sm font-medium text-gray-700 mb-2">
                    YouTube URL (Optional)
                  </label>
                  <input
                    type="url"
                    id="transcriptUrl"
                    value={transcriptUrl}
                    onChange={(e) => setTranscriptUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="transcriptDuration" className="block text-sm font-medium text-gray-700 mb-2">
                    Duration (Optional)
                  </label>
                  <input
                    type="text"
                    id="transcriptDuration"
                    value={transcriptDuration}
                    onChange={(e) => setTranscriptDuration(e.target.value)}
                    placeholder="e.g., 10:30"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={20}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor="transcriptDescription" className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  id="transcriptDescription"
                  value={transcriptDescription}
                  onChange={(e) => setTranscriptDescription(e.target.value)}
                  placeholder="Add notes or context about this material"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  maxLength={1000}
                  disabled={loading}
                />
              </div>

              <div className="mb-8">
                <label htmlFor="transcriptTags" className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (Optional)
                </label>
                <input
                  type="text"
                  id="transcriptTags"
                  value={transcriptTags}
                  onChange={(e) => setTranscriptTags(e.target.value)}
                  placeholder="math, calculus, derivatives (comma separated)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Add tags to help organize and search your content
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !transcriptText}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Upload & Process'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleDocumentSubmit}>
              <div className="mb-8">
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                    dragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {selectedFile ? (
                    <div>
                      <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900 mb-2">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500 mb-4">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Choose different file
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900 mb-2">
                        Drop your file here, or{' '}
                        <label htmlFor="file-upload" className="text-blue-600 hover:text-blue-700 cursor-pointer">
                          browse
                        </label>
                      </p>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={loading}
                      />
                      <p className="text-sm text-gray-500">
                        Supported formats: PDF, DOCX, TXT (Max 25MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedFile}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  'Upload & Process'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            What happens after upload?
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <span className="mr-2">1️⃣</span>
              <span><strong>Transcription:</strong> AI converts audio/text to timestamped transcript</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">2️⃣</span>
              <span><strong>Summarization:</strong> Generates multi-level summaries (quick, brief, detailed)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">3️⃣</span>
              <span><strong>Flashcards:</strong> Auto-creates 15-30 flashcards with spaced repetition</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">4️⃣</span>
              <span><strong>Quizzes:</strong> Generates adaptive quizzes to test understanding</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">5️⃣</span>
              <span><strong>AI Tutor:</strong> Ask questions and get timestamp-linked answers</span>
            </li>
          </ul>
          <p className="text-sm text-blue-700 mt-4 italic">
            Processing typically takes 2x the video length. You'll be notified when it's ready!
          </p>
        </div>
      </div>
    </div>
  )
}
