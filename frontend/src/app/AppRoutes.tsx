import { Route, Routes } from 'react-router'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { AuthListener } from './AuthListener'
import { RequireAuth } from './RequireAuth'

export function AppRoutes() {
  return (
    <>
      <AuthListener />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  )
}
