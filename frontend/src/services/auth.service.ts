import { apiClient } from './api.client'

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  name: string
}

export interface AuthResponse {
  success: boolean
  data: {
    user: {
      id: string
      email: string
      name: string
      role: string
      subscription: {
        tier: 'free' | 'premium' | 'institutional'
      }
    }
    token: string
  }
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/login', credentials)
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/register', data)
  },

  async getCurrentUser(): Promise<any> {
    return apiClient.get('/auth/me')
  },

  async logout(): Promise<void> {
    return apiClient.post('/auth/logout')
  },
}
