import { Route, Routes } from 'react-router'
import { ApiKeyPage } from '../pages/ApiKeyPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { AuthListener } from './AuthListener'
import { RequireAuth } from './RequireAuth'

export function AppRoutes() {
  return (
    <>
      <AuthListener />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings/api-key"
          element={
            <RequireAuth>
              <ApiKeyPage />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  )
}
