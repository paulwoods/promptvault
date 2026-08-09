import { Route, Routes } from 'react-router'
import { Layout } from '../components/Layout'
import { ApiKeyPage } from '../pages/ApiKeyPage'
import { CreatePromptPage } from '../pages/CreatePromptPage'
import { DuplicatePromptPage } from '../pages/DuplicatePromptPage'
import { EditPromptPage } from '../pages/EditPromptPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import { PromptConsolePage } from '../pages/PromptConsolePage'
import { PromptViewPage } from '../pages/PromptViewPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RunPage } from '../pages/RunPage'
import { TrashPage } from '../pages/TrashPage'
import { AuthListener } from './AuthListener'
import { RequireAuth } from './RequireAuth'

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
          <Route
            path="/prompts/new"
            element={
              <RequireAuth>
                <CreatePromptPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id"
            element={
              <RequireAuth>
                <PromptViewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/edit"
            element={
              <RequireAuth>
                <EditPromptPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/run"
            element={
              <RequireAuth>
                <RunPage />
              </RequireAuth>
            }
          />
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
            element={
              <RequireAuth>
                <DuplicatePromptPage />
              </RequireAuth>
            }
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
