import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'

// Placeholder components for remaining pages
const Content = () => <div className="container mx-auto p-8"><h1 className="text-3xl font-bold">Content View - Coming Soon</h1></div>
const Flashcards = () => <div className="container mx-auto p-8"><h1 className="text-3xl font-bold">Flashcards - Coming Soon</h1></div>

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
      />
      <Route
        path="/upload"
        element={isAuthenticated ? <Upload /> : <Navigate to="/login" />}
      />
      <Route
        path="/content/:id"
        element={isAuthenticated ? <Content /> : <Navigate to="/login" />}
      />
      <Route
        path="/flashcards/:contentId"
        element={isAuthenticated ? <Flashcards /> : <Navigate to="/login" />}
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}

export default App
