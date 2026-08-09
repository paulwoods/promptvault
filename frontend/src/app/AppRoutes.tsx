import { Navigate, Route, Routes, useParams } from 'react-router'
import { Layout } from '../components/Layout'
import { ApiKeyPage } from '../pages/ApiKeyPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import { PromptConsolePage } from '../pages/PromptConsolePage'
import { RegisterPage } from '../pages/RegisterPage'
import { TrashPage } from '../pages/TrashPage'
import { AuthListener } from './AuthListener'
import { RequireAuth } from './RequireAuth'

/**
 * Redirects a removed prompt page (View, Edit, Duplicate) to the Console, which
 * absorbed all three. Reads the `:id` param so the redirect preserves it.
 */
function RedirectToConsole() {
  const { id = '' } = useParams()
  return <Navigate replace to={`/prompts/${id}/console`} />
}

export function AppRoutes() {
  return (
    <>
      <AuthListener />
      <Routes>
        <Route element={<Layout />}>
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
          <Route path="/prompts/:id" element={<RedirectToConsole />} />
          <Route path="/prompts/:id/edit" element={<RedirectToConsole />} />
          <Route
            path="/prompts/:id/console"
            element={
              <RequireAuth>
                <PromptConsolePage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/duplicate"
            element={<RedirectToConsole />}
          />
          <Route
            path="/trash"
            element={
              <RequireAuth>
                <TrashPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
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
        </Route>
      </Routes>
    </>
  )
}
