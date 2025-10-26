import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import { DeletedItems } from './pages/DeletedItems'
import ContentDetail from './pages/ContentDetail'
import Flashcards from './pages/Flashcards'
import QuizList from './pages/QuizList'
import TakeQuiz from './pages/Quiz'
import Homepage from './pages/Homepage'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
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
        path="/deleted-items"
        element={isAuthenticated ? <DeletedItems /> : <Navigate to="/login" />}
      />
      <Route
        path="/content/:id"
        element={isAuthenticated ? <ContentDetail /> : <Navigate to="/login" />}
      />
      <Route
        path="/flashcards/:contentId"
        element={isAuthenticated ? <Flashcards /> : <Navigate to="/login" />}
      />
      <Route
        path="/quizzes/:contentId"
        element={isAuthenticated ? <QuizList /> : <Navigate to="/login" />}
      />
      <Route
        path="/quiz/:quizId"
        element={isAuthenticated ? <TakeQuiz /> : <Navigate to="/login" />}
      />
    </Routes>
  )
}

export default App
