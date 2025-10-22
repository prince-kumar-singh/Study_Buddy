import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qaService, QAQuestion } from '../services/qa.service'

export const useQAHistory = (contentId: string) => {
  return useQuery({
    queryKey: ['qa', 'history', contentId],
    queryFn: () => qaService.getHistory(contentId),
    enabled: !!contentId,
  })
}

export const useAskQuestion = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: QAQuestion) => qaService.askQuestion(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['qa', 'history', variables.contentId] })
    },
  })
}
