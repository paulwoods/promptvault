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
  currentVersionNumber: number
  createdAt: string
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

export interface VersionResponse {
  promptId: string
  versionId: string
  number: number
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
}

export interface VersionSummary {
  versionId: string
  number: number
  name: string
  createdAt: string
  current: boolean
}

export interface PromptDetail {
  promptId: string
  versions: VersionSummary[]
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

export interface RunSummary {
  runId: string
  versionNumber: number
  status: string
  responsePreview?: string | null
  createdAt: string
}

export interface ModelUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

export interface ActivityItem {
  id: string
  type: string
  occurredAt: string
  label: string
  versionNumber?: number | null
  runStatus?: string | null
}

export interface RunDetail {
  runId: string
  versionNumber: number
  model: string
  variableValues: Record<string, string>
  renderedPrompt: string
  response?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  status: string
  errorCategory?: string | null
  errorMessage?: string | null
  createdAt: string
}
