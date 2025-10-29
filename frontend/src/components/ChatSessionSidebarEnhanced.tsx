import { useState, useEffect, useRef } from 'react'
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Clock,
  MessageCircle,
  Search,
  Filter,
  Tag,
  Folder,
  Pin,
  Share2,
  Download,
  Sparkles,
  BarChart3,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ChatSession } from '../services/chat-session.service'

interface ChatSessionSidebarEnhancedProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newTitle: string) => void
  onGenerateAITitle?: (sessionId: string) => void
  onTogglePin?: (sessionId: string, isPinned: boolean) => void
  onUpdateTags?: (sessionId: string, tags: string[]) => void
  onUpdateFolder?: (sessionId: string, folder: string) => void
  onShareSession?: (sessionId: string) => void
  onExportSession?: (sessionId: string, format: 'json' | 'txt') => void
  onViewAnalytics?: (sessionId: string) => void
  isLoading?: boolean
}

export const ChatSessionSidebarEnhanced = ({
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onGenerateAITitle,
  onTogglePin,
  // onUpdateTags,
  // onUpdateFolder,
  onShareSession,
  onExportSession,
  onViewAnalytics,
  isLoading = false,
}: ChatSessionSidebarEnhancedProps) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Extract unique tags and folders from sessions
  const allTags = Array.from(new Set(sessions.flatMap(s => s.tags || [])))
  const allFolders = Array.from(new Set(sessions.map(s => s.folder).filter(Boolean))) as string[]

  // Filter sessions based on search and filters
  const filteredSessions = sessions.filter(session => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesTitle = session.title.toLowerCase().includes(query)
      const matchesQuestion = session.metadata?.firstQuestion?.toLowerCase().includes(query)
      if (!matchesTitle && !matchesQuestion) return false
    }

    // Tag filter
    if (selectedTags.length > 0) {
      const hasTag = selectedTags.some(tag => session.tags?.includes(tag))
      if (!hasTag) return false
    }

    // Folder filter
    if (selectedFolder !== null) {
      if (session.folder !== selectedFolder) return false
    }

    return true
  })

  // Sort sessions: pinned first, then by last message
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })

  // Group by folder if folder view is enabled
  const groupedSessions = allFolders.length > 0 ? groupSessionsByFolder(sortedSessions) : { 'All Sessions': sortedSessions }

  function groupSessionsByFolder(sessions: ChatSession[]) {
    const groups: Record<string, ChatSession[]> = { 'No Folder': [] }
    sessions.forEach(session => {
      const folder = session.folder || 'No Folder'
      if (!groups[folder]) groups[folder] = []
      groups[folder].push(session)
    })
    return groups
  }

  const handleStartEdit = (session: ChatSession) => {
    setEditingSessionId(session._id)
    setEditTitle(session.title)
  }

  const handleSaveEdit = (sessionId: string) => {
    if (editTitle.trim()) {
      onRenameSession(sessionId, editTitle.trim())
    }
    setEditingSessionId(null)
    setEditTitle('')
  }

  const handleCancelEdit = () => {
    setEditingSessionId(null)
    setEditTitle('')
  }

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder)
    } else {
      newExpanded.add(folder)
    }
    setExpandedFolders(newExpanded)
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="w-80 sm:w-72 md:w-80 bg-gradient-to-b from-white via-gray-50/50 to-gray-100/50 border-r border-gray-200/50 flex flex-col h-full backdrop-blur-sm shadow-xl lg:shadow-none">
      {/* Enhanced Header */}
      <div className="p-4 border-b border-gray-200/50 space-y-4 bg-white/80 backdrop-blur-sm">
        <button
          onClick={onNewSession}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl hover-lift disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Plus size={20} />
          <span className="font-medium">New Chat Session</span>
        </button>

        {/* Enhanced Search Input */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions (⌘K)"
            className="w-full pl-10 pr-10 py-3 border border-gray-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm bg-white/50 backdrop-blur-sm transition-all duration-200 hover:bg-white/80"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Button */}
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <Filter size={16} />
              Filters
              {(selectedTags.length > 0 || selectedFolder) && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                  {selectedTags.length + (selectedFolder ? 1 : 0)}
                </span>
              )}
            </span>
            <ChevronDown size={16} />
          </button>

          {/* Filter Dropdown */}
          {showFilterMenu && (
            <div className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
              {/* Tags Filter */}
              {allTags.length > 0 && (
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
                    <Tag size={14} />
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTags(prev =>
                            prev.includes(tag)
                              ? prev.filter(t => t !== tag)
                              : [...prev, tag]
                          )
                        }}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          selectedTags.includes(tag)
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Folders Filter */}
              {allFolders.length > 0 && (
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
                    <Folder size={14} />
                    Folders
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => setSelectedFolder(null)}
                      className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                        selectedFolder === null
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      All Folders
                    </button>
                    {allFolders.map(folder => (
                      <button
                        key={folder}
                        onClick={() => setSelectedFolder(folder)}
                        className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                          selectedFolder === folder
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {folder}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allTags.length === 0 && allFolders.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500">
                  No tags or folders yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare size={48} className="mx-auto mb-2 opacity-30" />
            <p>Loading sessions...</p>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageCircle size={48} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {searchQuery || selectedTags.length > 0 || selectedFolder
                ? 'No sessions match your filters'
                : 'No chat sessions yet'}
            </p>
            {!searchQuery && selectedTags.length === 0 && !selectedFolder && (
              <p className="text-xs mt-1">Start a new chat to begin</p>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {Object.entries(groupedSessions).map(([folder, folderSessions]) => (
              <div key={folder}>
                {/* Folder Header (if using folders) */}
                {allFolders.length > 0 && (
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center gap-2 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors mb-1"
                  >
                    {expandedFolders.has(folder) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Folder size={14} />
                    {folder}
                    <span className="text-xs text-gray-500">({folderSessions.length})</span>
                  </button>
                )}

                {/* Sessions in Folder */}
                {(!allFolders.length || expandedFolders.has(folder)) && folderSessions.map((session) => (
                  <SessionItem
                    key={session._id}
                    session={session}
                    isActive={currentSessionId === session._id}
                    isEditing={editingSessionId === session._id}
                    editTitle={editTitle}
                    onSelect={() => onSessionSelect(session._id)}
                    onStartEdit={() => handleStartEdit(session)}
                    onSaveEdit={() => handleSaveEdit(session._id)}
                    onCancelEdit={handleCancelEdit}
                    onEditTitleChange={setEditTitle}
                    onDelete={() => {
                      if (window.confirm('Delete this chat session? All messages will be removed.')) {
                        onDeleteSession(session._id)
                      }
                    }}
                    onGenerateAITitle={() => onGenerateAITitle?.(session._id)}
                    onTogglePin={() => onTogglePin?.(session._id, !session.isPinned)}
                    onShare={() => onShareSession?.(session._id)}
                    onExport={(format) => onExportSession?.(session._id, format)}
                    onViewAnalytics={() => onViewAnalytics?.(session._id)}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} />
            <span>{sortedSessions.length} session{sortedSessions.length !== 1 ? 's' : ''}</span>
          </div>
          {sessions.length !== sortedSessions.length && (
            <span className="text-blue-600">({sessions.length - sortedSessions.length} hidden)</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Separate SessionItem component for better organization
interface SessionItemProps {
  session: ChatSession
  isActive: boolean
  isEditing: boolean
  editTitle: string
  onSelect: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditTitleChange: (title: string) => void
  onDelete: () => void
  onGenerateAITitle?: () => void
  onTogglePin?: () => void
  onShare?: () => void
  onExport?: (format: 'json' | 'txt') => void
  onViewAnalytics?: () => void
  formatDate: (date: Date | string) => string
}

const SessionItem = ({
  session,
  isActive,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTitleChange,
  onDelete,
  onGenerateAITitle,
  onTogglePin,
  onShare,
  onExport,
  onViewAnalytics,
  formatDate,
}: SessionItemProps) => {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div
      className={`group relative rounded-lg transition-colors ${
        isActive
          ? 'bg-white shadow-sm border border-blue-200'
          : 'hover:bg-gray-100'
      }`}
    >
      {isEditing ? (
        // Editing mode
        <div className="p-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={onSaveEdit}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Check size={14} />
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // Normal mode
        <div className="relative">
          <div
            onClick={onSelect}
            className="p-3 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {session.isPinned && <Pin size={12} className="text-blue-600 flex-shrink-0" />}
                  <h3 className="font-medium text-sm text-gray-900 truncate flex-1">
                    {session.title}
                  </h3>
                  {session.metadata?.aiGeneratedTitle && (
                    <span title="AI Generated Title">
                      <Sparkles size={12} className="text-purple-500 flex-shrink-0" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <Clock size={12} />
                  <span>{formatDate(session.lastMessageAt)}</span>
                  <span>•</span>
                  <span>{session.messageCount} msgs</span>
                  {session.isShared && (
                    <>
                      <span>•</span>
                      <span title="Shared">
                        <Share2 size={12} className="text-green-600" />
                      </span>
                    </>
                  )}
                </div>
                {/* Tags */}
                {session.tags && session.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {session.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Menu Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(!showMenu)
                }}
                className={`p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors ${
                  isActive || showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                •••
              </button>
            </div>
          </div>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-2 top-12 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-48">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEdit()
                  setShowMenu(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
              >
                <Edit2 size={14} />
                Rename
              </button>
              
              {onGenerateAITitle && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGenerateAITitle()
                    setShowMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  Generate AI Title
                </button>
              )}

              {onTogglePin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onTogglePin()
                    setShowMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Pin size={14} />
                  {session.isPinned ? 'Unpin' : 'Pin to Top'}
                </button>
              )}

              {onShare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onShare()
                    setShowMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Share2 size={14} />
                  {session.isShared ? 'Manage Share' : 'Share Session'}
                </button>
              )}

              {onExport && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onExport('json')
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Download size={14} />
                    Export as JSON
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onExport('txt')
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Download size={14} />
                    Export as Text
                  </button>
                </>
              )}

              {onViewAnalytics && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewAnalytics()
                    setShowMenu(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <BarChart3 size={14} />
                  View Analytics
                </button>
              )}

              <div className="border-t border-gray-200 my-1" />

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                  setShowMenu(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete Session
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
