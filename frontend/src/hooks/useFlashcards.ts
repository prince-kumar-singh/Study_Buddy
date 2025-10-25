import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flashcardService } from '../services/flashcard.service'

export const useFlashcards = (contentId: string) => {
  return useQuery({
    queryKey: ['flashcards', contentId],
    queryFn: () => flashcardService.getFlashcards(contentId),
    enabled: !!contentId,
  })
}

export const useDueFlashcards = () => {
  return useQuery({
    queryKey: ['flashcards', 'due'],
    queryFn: () => flashcardService.getDueFlashcards(),
  })
}

export const useFlashcardStatistics = () => {
  return useQuery({
    queryKey: ['flashcards', 'statistics'],
    queryFn: () => flashcardService.getStatistics(),
  })
}

export const useReviewFlashcard = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, quality, responseTime }: { id: string; quality: number; responseTime?: number }) =>
      flashcardService.reviewFlashcard(id, quality, responseTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    },
  })
}
