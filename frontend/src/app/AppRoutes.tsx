import { Route, Routes } from 'react-router'
import { ApiKeyPage } from '../pages/ApiKeyPage'
import { CreatePromptPage } from '../pages/CreatePromptPage'
import { EditFromVersionPage } from '../pages/EditFromVersionPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { PromptDetailPage } from '../pages/PromptDetailPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RunPage } from '../pages/RunPage'
import { VersionViewPage } from '../pages/VersionViewPage'
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
          path="/prompts/:id/versions/:number"
          element={
            <RequireAuth>
              <VersionViewPage />
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
