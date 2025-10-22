import { useEffect, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

interface ProcessingStatus {
  contentId: string
  stage: string
  progress: number
  message: string
}

interface AIGenerationStatus {
  contentId: string
  type: 'summary' | 'flashcards' | 'quiz' | 'qa'
  progress: number
  message: string
}

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { token } = useAuthStore()

  useEffect(() => {
    if (!token) return

    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
    })

    newSocket.on('connect', () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
    })

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [token])

  const onProcessingStatus = useCallback(
    (callback: (data: ProcessingStatus) => void) => {
      if (!socket) return

      socket.on('processing:status', callback)

      return () => {
        socket.off('processing:status', callback)
      }
    },
    [socket]
  )

  const onAIGeneration = useCallback(
    (callback: (data: AIGenerationStatus) => void) => {
      if (!socket) return

      socket.on('ai:generation', callback)

      return () => {
        socket.off('ai:generation', callback)
      }
    },
    [socket]
  )

  return {
    socket,
    isConnected,
    onProcessingStatus,
    onAIGeneration,
  }
}
