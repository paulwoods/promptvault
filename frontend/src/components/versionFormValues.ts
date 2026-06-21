import type { VariableDeclaration } from '../lib/types'

export interface VariableRow {
  name: string
  description: string
  required: boolean
  defaultValue: string
}

export interface VersionFormValues {
  name: string
  description: string
  promptText: string
  systemPrompt: string
  model: string
  maxTokens: number
  effort: string
  thinking: string
  variables: VariableRow[]
}

export interface VersionRequestBody {
  name: string
  description: string | null
  promptText: string
  systemPrompt: string | null
  model: string
  maxTokens: number
  effort: string
  thinking: string
  variables: VariableDeclaration[]
}

export function emptyVersionValues(defaultModel: string): VersionFormValues {
  return {
    name: '',
    description: '',
    promptText: '',
    systemPrompt: '',
    model: defaultModel,
    maxTokens: 1000,
    effort: 'medium',
    thinking: 'off',
    variables: [],
  }
}
