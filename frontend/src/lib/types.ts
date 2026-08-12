/** Shared API DTO types mirroring the backend contracts. */

/** An offset-paginated list (9.2) — no total count, "Load more" rather than numbered pages. */
export interface Page<T> {
  items: T[]
  hasMore: boolean
}

export interface PromptSummary {
  promptId: string
  name: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export interface PromptResponse {
  promptId: string
  name: string
  description?: string | null
  promptText: string
  model: string
  systemPrompt?: string | null
  maxTokens: number
  effort: string
  thinking: string
  createdAt: string
  updatedAt: string
}

export interface TrashedPromptSummary {
  promptId: string
  name: string
  deletedAt: string
}

export interface ModelCapability {
  id: string
  supportsEffort: boolean
  supportsAdaptiveThinking: boolean
}

export interface ModelsResponse {
  models: ModelCapability[]
  defaultModel: string
}

export interface Me {
  id: string
  email: string
  name: string
}

export interface ApiKeyStatus {
  hasKey: boolean
  updatedAt?: string | null
  lastSix?: string | null
}

export interface ModelUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

/** Response from `POST /api/auth/login`. */
export interface LoginResponse {
  token: string
}

/**
 * Response from `GET /api/auth/config`. `googleClientId` is absent (or null)
 * when Google sign-in is not configured, and no Google button is offered.
 */
export interface AuthConfig {
  googleClientId?: string | null
}

/** Response from `POST /api/auth/register`. */
export interface RegisterResponse {
  id: string
  email: string
}
