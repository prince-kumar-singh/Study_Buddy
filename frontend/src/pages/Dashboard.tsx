import { useContents } from '../hooks/useContent'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const { data: contentsData, isLoading } = useContents()

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Total Contents</h3>
            <p className="text-3xl font-bold text-blue-600">
              {contentsData?.data?.contents?.length || 0}
            </p>
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
                <Link
                  key={content._id}
                  to={`/content/${content._id}`}
                  className="block p-6 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900 mb-1">{content.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">{content.description}</p>
                      <div className="flex gap-2">
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                          {content.type}
                        </span>
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded ${
                            content.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : content.status === 'processing'
                              ? 'bg-yellow-100 text-yellow-700'
                              : content.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {content.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(content.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Dashboard
