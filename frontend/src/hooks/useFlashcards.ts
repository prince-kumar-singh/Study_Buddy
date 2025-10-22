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

export const useReviewFlashcard = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, quality }: { id: string; quality: number }) =>
      flashcardService.reviewFlashcard(id, quality),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flashcards'] })
    },
  })
}
