import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService, LoginCredentials, RegisterData } from '../services/auth.service'
import { useAuthStore } from '../store/auth.store'
import { useNavigate } from 'react-router-dom'

export const useAuth = () => {
  const { login: setAuth, logout: clearAuth, user, token } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      setAuth(data.data.user, data.data.token)
      queryClient.invalidateQueries({ queryKey: ['user'] })
      navigate('/dashboard')
    },
  })

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onSuccess: (data) => {
      setAuth(data.data.user, data.data.token)
      queryClient.invalidateQueries({ queryKey: ['user'] })
      navigate('/dashboard')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login')
    },
  })

  const { data: currentUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: () => authService.getCurrentUser(),
    enabled: !!token,
    retry: false,
  })

  return {
    user,
    token,
    currentUser: currentUser?.data?.user,
    isLoadingUser,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  }
}
