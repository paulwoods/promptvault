/** Shared API DTO types mirroring the backend contracts. */

export interface PromptSummary {
  promptId: string
  name: string
  currentVersionNumber: number
  createdAt: string
}

export interface VariableDeclaration {
  name: string
  description?: string | null
  required?: boolean | null
  defaultValue?: string | null
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

export interface ModelCapability {
  id: string
  supportsEffort: boolean
  supportsAdaptiveThinking: boolean
}

export interface ModelsResponse {
  models: ModelCapability[]
  defaultModel: string
}

export interface ApiKeyStatus {
  hasKey: boolean
  updatedAt?: string | null
}

export interface RunSummary {
  runId: string
  versionNumber: number
  status: string
  responsePreview?: string | null
  createdAt: string
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
