import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  User, 
  Bell, 
  Shield, 
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { authService } from '../services/auth.service'
import { useAuthStore } from '../store/auth.store'

const Settings = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      return
    }

    setDeleteStatus('deleting')
    setDeleteError(null)

    try {
      await authService.deleteAccount()
      setDeleteStatus('success')
      
      // Clear all local storage and logout
      localStorage.clear()
      sessionStorage.clear()
      
      // Wait a moment to show success, then redirect
      setTimeout(() => {
        logout()
        navigate('/', { replace: true })
      }, 2000)
      
    } catch (error: any) {
      console.error('Error deleting account:', error)
      setDeleteStatus('error')
      setDeleteError(error.response?.data?.message || 'Failed to delete account. Please try again.')
    }
  }

  const resetDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteConfirmText('')
    setDeleteStatus('idle')
    setDeleteError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-200"
                aria-label="Back to dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden">
            
            {/* Profile Section */}
            <div className="p-6 border-b border-gray-200/50">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <p className="text-gray-900">{user?.name || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <p className="text-gray-900">{user?.email || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subscription</label>
                    <p className="text-gray-900 capitalize">{user?.subscription?.tier || 'Free'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <p className="text-gray-900 capitalize">{user?.role || 'Student'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifications Section */}
            <div className="p-6 border-b border-gray-200/50">
              <div className="flex items-center gap-3 mb-4">
                <Bell className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Email Notifications</h3>
                    <p className="text-sm text-gray-600">Receive updates about your content processing</p>
                  </div>
                  <div className="text-sm text-gray-500">Coming Soon</div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Study Reminders</h3>
                    <p className="text-sm text-gray-600">Get reminded to review your flashcards</p>
                  </div>
                  <div className="text-sm text-gray-500">Coming Soon</div>
                </div>
              </div>
            </div>

            {/* Privacy & Security Section */}
            <div className="p-6 border-b border-gray-200/50">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900">Privacy & Security</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Change Password</h3>
                    <p className="text-sm text-gray-600">Update your account password</p>
                  </div>
                  <div className="text-sm text-gray-500">Coming Soon</div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Data Export</h3>
                    <p className="text-sm text-gray-600">Download all your data</p>
                  </div>
                  <div className="text-sm text-gray-500">Coming Soon</div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="p-6 bg-red-50/50">
              <div className="flex items-center gap-3 mb-4">
                <Trash2 className="w-5 h-5 text-red-600" />
                <h2 className="text-xl font-semibold text-red-900">Danger Zone</h2>
              </div>
              <div className="bg-white rounded-xl border border-red-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 mb-2">Delete Account</h3>
                    <p className="text-sm text-red-700 mb-4">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <div className="text-xs text-red-600 space-y-1">
                      <p>• All your uploaded content will be deleted</p>
                      <p>• All flashcards, quizzes, and study materials will be removed</p>
                      <p>• All chat sessions and Q&A history will be deleted</p>
                      <p>• Your progress and analytics will be lost forever</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="ml-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Delete Account</h3>
              </div>

              {deleteStatus === 'success' ? (
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <p className="text-green-800 font-medium mb-2">Account Deleted Successfully</p>
                  <p className="text-sm text-gray-600">Redirecting you to the homepage...</p>
                </div>
              ) : deleteStatus === 'error' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl">
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-red-800 font-medium">Deletion Failed</p>
                      <p className="text-sm text-red-600">{deleteError}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={resetDeleteModal}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setDeleteStatus('idle')
                        setDeleteError(null)
                      }}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 rounded-xl">
                    <p className="text-red-800 font-medium mb-2">⚠️ This action is irreversible!</p>
                    <p className="text-sm text-red-700">
                      All your data will be permanently deleted and cannot be recovered.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="deleteConfirm" className="block text-sm font-medium text-gray-700 mb-2">
                      Type <strong>DELETE</strong> to confirm:
                    </label>
                    <input
                      id="deleteConfirm"
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="DELETE"
                      disabled={deleteStatus === 'deleting'}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={resetDeleteModal}
                      disabled={deleteStatus === 'deleting'}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleteStatus === 'deleting'}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {deleteStatus === 'deleting' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Delete Account'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings