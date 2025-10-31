import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Clock,
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
  ChevronRight,
  MoreHorizontal,
  Calendar,
  Hash,
  FolderOpen,
  Star,
  Archive,
  User,
  Settings,
  HelpCircle,
  LogOut
} from 'lucide-react'
import { ChatSession } from '../services/chat-session.service'

interface ChatSessionSidebarProps {
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
  onCloseSidebar?: () => void
  isLoading?: boolean
  isMobile?: boolean
  currentUser?: any
}

type SortOption = 'recent' | 'alphabetical' | 'pinned' | 'oldest'
type ViewMode = 'list' | 'grid' | 'compact'

export const ChatSessionSidebar: React.FC<ChatSessionSidebarProps> = ({
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onGenerateAITitle,
  onTogglePin,
  onShareSession,
  onExportSession,
  onViewAnalytics,
  onCloseSidebar,
  isLoading = false,
  isMobile = false,
  currentUser
}) => {
  // State management
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showFilters, setShowFilters] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['recent']))

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Memoized computations for performance
  const { allTags, allFolders } = useMemo(() => {
    const tags = Array.from(new Set(sessions.flatMap(s => s.tags || [])))
    const folders = Array.from(new Set(sessions.map(s => s.folder).filter(Boolean))) as string[]
    return { allTags: tags, allFolders: folders }
  }, [sessions])

  const filteredAndSortedSessions = useMemo(() => {
    let filtered = sessions.filter(session => {
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

    // Sort sessions
    return filtered.sort((a, b) => {
      // Always put pinned items first
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1

      switch (sortBy) {
        case 'alphabetical':
          return a.title.localeCompare(b.title)
        case 'oldest':
          return new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
        case 'pinned':
          return a.isPinned === b.isPinned ? 
            new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime() : 0
        case 'recent':
        default:
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      }
    })
  }, [sessions, searchQuery, selectedTags, selectedFolder, sortBy])

  const groupedSessions = useMemo(() => {
    if (allFolders.length === 0) {
      return { 'All Sessions': filteredAndSortedSessions }
    }

    const groups: Record<string, ChatSession[]> = {}
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Smart grouping by recency for better UX
    groups['Today'] = []
    groups['Yesterday'] = []
    groups['This Week'] = []
    groups['Older'] = []

    filteredAndSortedSessions.forEach(session => {
      const sessionDate = new Date(session.lastMessageAt)
      if (sessionDate >= today) {
        groups['Today'].push(session)
      } else if (sessionDate >= yesterday) {
        groups['Yesterday'].push(session)
      } else if (sessionDate >= thisWeek) {
        groups['This Week'].push(session)
      } else {
        groups['Older'].push(session)
      }
    })

    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) {
        delete groups[key]
      }
    })

    return groups
  }, [filteredAndSortedSessions, allFolders.length])

  // Event handlers
  const handleStartEdit = useCallback((session: ChatSession) => {
    setEditingSessionId(session._id)
    setEditTitle(session.title)
    setActiveDropdown(null)
  }, [])

  const handleSaveEdit = useCallback((sessionId: string) => {
    if (editTitle.trim() && editTitle.trim() !== sessions.find(s => s._id === sessionId)?.title) {
      onRenameSession(sessionId, editTitle.trim())
    }
    setEditingSessionId(null)
    setEditTitle('')
  }, [editTitle, onRenameSession, sessions])

  const handleCancelEdit = useCallback(() => {
    setEditingSessionId(null)
    setEditTitle('')
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Global keyboard shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    if (e.key === 'Escape') {
      setActiveDropdown(null)
      setShowFilters(false)
      if (editingSessionId) {
        handleCancelEdit()
      }
    }
  }, [editingSessionId, handleCancelEdit])

  const handleSessionClick = useCallback((sessionId: string) => {
    onSessionSelect(sessionId)
    if (isMobile) {
      onCloseSidebar?.()
    }
  }, [onSessionSelect, isMobile, onCloseSidebar])

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(folder)) {
        newExpanded.delete(folder)
      } else {
        newExpanded.add(folder)
      }
      return newExpanded
    })
  }, [])

  const formatRelativeTime = useCallback((date: Date | string) => {
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
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedTags([])
    setSelectedFolder(null)
  }, [])

  // Effects
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Render session item
  const renderSessionItem = useCallback((session: ChatSession) => {
    const isActive = session._id === currentSessionId
    const isEditing = editingSessionId === session._id

    return (
      <div
        key={session._id}
        className={`
          session-item group relative rounded-xl 
          ${isActive 
            ? 'active' 
            : 'hover:shadow-sm'
          }
          ${viewMode === 'compact' ? 'p-3' : 'p-4'}
        `}
      >
        <div 
          className="flex items-center gap-3 cursor-pointer min-w-0"
          onClick={() => !isEditing && handleSessionClick(session._id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              !isEditing && handleSessionClick(session._id)
            }
          }}
          aria-label={`Open chat session: ${session.title}`}
        >
          {/* Session Icon */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
            ${isActive ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-gray-200'}
            transition-colors duration-200
          `}>
            {session.isPinned ? (
              <Pin className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-600'}`} />
            ) : (
              <MessageSquare className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-600'}`} />
            )}
          </div>

          {/* Session Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      handleSaveEdit(session._id)
                    } else if (e.key === 'Escape') {
                      handleCancelEdit()
                    }
                  }}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSaveEdit(session._id)
                  }}
                  className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                  aria-label="Save changes"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancelEdit()
                  }}
                  className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  aria-label="Cancel editing"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`
                    font-medium text-sm truncate
                    ${isActive ? 'text-white' : 'text-gray-900'}
                  `}>
                    {session.title}
                  </h3>
                  {session.tags && session.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Tag className={`w-3 h-3 ${isActive ? 'text-white/70' : 'text-gray-400'}`} />
                      <span className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                        {session.tags.length}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-3 h-3 ${isActive ? 'text-white/70' : 'text-gray-400'}`} />
                    <span className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                      {formatRelativeTime(session.lastMessageAt)}
                    </span>
                  </div>
                  {session.metadata?.messageCount && (
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${isActive 
                        ? 'bg-white/20 text-white/80' 
                        : 'bg-gray-100 text-gray-600'
                      }
                    `}>
                      {session.metadata.messageCount} msgs
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions Menu */}
          {!isEditing && (
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(activeDropdown === session._id ? null : session._id)
                }}
                className={`
                  p-1.5 rounded-lg transition-colors
                  ${isActive 
                    ? 'text-white/70 hover:text-white hover:bg-white/10' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }
                `}
                aria-label="Session actions"
              >
                <MoreHorizontal size={16} />
              </button>

              {/* Dropdown Menu */}
              {activeDropdown === session._id && (
                <div 
                  ref={dropdownRef}
                  className={`
                    dropdown-enter dropdown-enter-active
                    absolute right-0 top-12 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50
                    ${isMobile ? 'right-4' : 'right-0'}
                  `}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="py-1">
                    <button
                      onClick={() => {
                        handleStartEdit(session)
                        setActiveDropdown(null)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Edit2 size={16} />
                      Rename
                    </button>
                    
                    {onTogglePin && (
                      <button
                        onClick={() => {
                          onTogglePin(session._id, !session.isPinned)
                          setActiveDropdown(null)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Pin size={16} />
                        {session.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                    
                    {onGenerateAITitle && (
                      <button
                        onClick={() => {
                          onGenerateAITitle(session._id)
                          setActiveDropdown(null)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Sparkles size={16} />
                        AI Title
                      </button>
                    )}
                    
                    <div className="border-t border-gray-100 my-1" />
                    
                    {onShareSession && (
                      <button
                        onClick={() => {
                          onShareSession(session._id)
                          setActiveDropdown(null)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Share2 size={16} />
                        Share
                      </button>
                    )}
                    
                    {onExportSession && (
                      <button
                        onClick={() => {
                          onExportSession(session._id, 'txt')
                          setActiveDropdown(null)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Download size={16} />
                        Export
                      </button>
                    )}
                    
                    <div className="border-t border-gray-100 my-1" />
                    
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this session?')) {
                          onDeleteSession(session._id)
                        }
                        setActiveDropdown(null)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }, [
    currentSessionId, 
    editingSessionId, 
    editTitle, 
    activeDropdown, 
    viewMode, 
    isMobile,
    handleSessionClick,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    formatRelativeTime,
    onTogglePin,
    onGenerateAITitle,
    onShareSession,
    onExportSession,
    onDeleteSession
  ])

  return (
    <div 
      ref={sidebarRef}
      className={`
        h-full bg-white flex flex-col
        ${isMobile ? 'w-full' : 'w-full'}
        sidebar-optimized
      `}
      role="complementary"
      aria-label="Chat sessions sidebar"
    >
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-gray-50/50">
        {/* Mobile Header */}
        {isMobile && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Chats</h2>
            </div>
            <button
              onClick={onCloseSidebar}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* User Profile Section */}
        {currentUser && (
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg mb-4 shadow-sm">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
              {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentUser.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {currentUser.email}
              </p>
            </div>
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="User settings"
            >
              <Settings size={16} />
            </button>
          </div>
        )}

        {/* New Chat Button */}
        <button
          onClick={onNewSession}
          disabled={isLoading}
          className={`
            btn-press w-full flex items-center justify-center gap-3 px-4 py-3 mb-4
            bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl
            hover:from-blue-700 hover:to-purple-700 hover-lift
            transition-all duration-200 shadow-lg hover:shadow-xl
            disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
            font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            focus-visible
          `}
          aria-label="Start new chat session"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Plus size={20} />
          )}
          <span>New Chat</span>
        </button>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats (⌘K)"
            className={`
              w-full pl-10 pr-10 py-2.5 
              border border-gray-200 rounded-lg 
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              text-sm bg-white/80 backdrop-blur-sm
              transition-all duration-200 hover:bg-white
            `}
            aria-label="Search chat sessions"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors p-1"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters & View Controls */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`
              flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-all duration-200
              ${showFilters || selectedTags.length > 0 || selectedFolder
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }
            `}
            aria-label={`${showFilters ? 'Hide' : 'Show'} filters`}
            aria-expanded={showFilters}
          >
            <Filter size={16} />
            Filters
            {(selectedTags.length > 0 || selectedFolder) && (
              <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded-full text-xs">
                {selectedTags.length + (selectedFolder ? 1 : 0)}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            aria-label="Sort sessions by"
          >
            <option value="recent">Most Recent</option>
            <option value="alphabetical">A to Z</option>
            <option value="oldest">Oldest First</option>
            <option value="pinned">Pinned First</option>
          </select>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            {/* Tags Filter */}
            {allTags.length > 0 && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Tag size={14} />
                  Tags
                </label>
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
                      className={`
                        px-2 py-1 text-xs rounded-md border transition-all duration-200
                        ${selectedTags.includes(tag)
                          ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }
                      `}
                      aria-pressed={selectedTags.includes(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Folders Filter */}
            {allFolders.length > 0 && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Folder size={14} />
                  Folders
                </label>
                <select
                  value={selectedFolder || ''}
                  onChange={(e) => setSelectedFolder(e.target.value || null)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">All Folders</option>
                  {allFolders.map(folder => (
                    <option key={folder} value={folder}>{folder}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear Filters */}
            {(selectedTags.length > 0 || selectedFolder) && (
              <button
                onClick={clearAllFilters}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X size={16} />
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">Loading sessions...</p>
            </div>
          </div>
        ) : filteredAndSortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {searchQuery || selectedTags.length > 0 || selectedFolder 
                ? 'No matching sessions' 
                : 'No chat sessions yet'
              }
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {searchQuery || selectedTags.length > 0 || selectedFolder
                ? 'Try adjusting your search or filters'
                : 'Start a new conversation to begin'
              }
            </p>
            {(searchQuery || selectedTags.length > 0 || selectedFolder) && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {Object.entries(groupedSessions).map(([groupName, groupSessions]) => (
              <div key={groupName}>
                {/* Group Header */}
                <button
                  onClick={() => toggleFolder(groupName)}
                  className="w-full flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  aria-expanded={expandedFolders.has(groupName)}
                >
                  {expandedFolders.has(groupName) ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <span>{groupName}</span>
                  <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {groupSessions.length}
                  </span>
                </button>

                {/* Group Sessions */}
                {expandedFolders.has(groupName) && (
                  <div className="space-y-2 ml-4">
                    {groupSessions.map(renderSessionItem)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Hash size={12} />
          <span>{sessions.length} total sessions</span>
          {selectedTags.length > 0 || selectedFolder || searchQuery ? (
            <>
              <span>•</span>
              <span>{filteredAndSortedSessions.length} filtered</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ChatSessionSidebar