import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contentService } from '../services/content.service'

export const useContents = (filters?: { status?: string; type?: string }) => {
  return useQuery({
    queryKey: ['contents', filters],
    queryFn: () => contentService.getContents(filters),
  })
}

export const useContent = (id: string) => {
  return useQuery({
    queryKey: ['content', id],
    queryFn: () => contentService.getContentById(id),
    enabled: !!id,
  })
}

export const useUploadYouTube = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ url, title }: { url: string; title: string }) =>
      contentService.uploadYouTube(url, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
    },
  })
}

export const useUploadDocument = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => contentService.uploadDocument(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
    },
  })
}

export const useDeleteContent = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => contentService.deleteContent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
    },
  })
}
