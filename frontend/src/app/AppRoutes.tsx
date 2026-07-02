import { Route, Routes } from 'react-router'
import { Layout } from '../components/Layout'
import { ApiKeyPage } from '../pages/ApiKeyPage'
import { CreatePromptPage } from '../pages/CreatePromptPage'
import { DuplicateFromVersionPage } from '../pages/DuplicateFromVersionPage'
import { EditFromVersionPage } from '../pages/EditFromVersionPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import { PromptDetailPage } from '../pages/PromptDetailPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RunDetailPage } from '../pages/RunDetailPage'
import { RunListPage } from '../pages/RunListPage'
import { RunPage } from '../pages/RunPage'
import { TrashPage } from '../pages/TrashPage'
import { VersionViewPage } from '../pages/VersionViewPage'
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
                <PromptDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/runs"
            element={
              <RequireAuth>
                <RunListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/versions/:number"
            element={
              <RequireAuth>
                <VersionViewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/versions/:number/runs"
            element={
              <RequireAuth>
                <RunListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/versions/:number/edit"
            element={
              <RequireAuth>
                <EditFromVersionPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/versions/:number/run"
            element={
              <RequireAuth>
                <RunPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/versions/:number/duplicate"
            element={
              <RequireAuth>
                <DuplicateFromVersionPage />
              </RequireAuth>
            }
          />
          <Route
            path="/prompts/:id/runs/:runId"
            element={
              <RequireAuth>
                <RunDetailPage />
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
