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

export interface VariableDeclaration {
  name: string
  description?: string | null
  required?: boolean | null
  defaultValue?: string | null
}

export function isRequired(variable: VariableDeclaration): boolean {
  return variable.required ?? true
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
  variables: VariableDeclaration[]
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
