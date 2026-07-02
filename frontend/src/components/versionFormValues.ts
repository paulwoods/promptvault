import { isRequired } from '../lib/types'
import type { VariableDeclaration, VersionResponse } from '../lib/types'

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

/** Seeds form values from an existing Version -- used to edit-from or duplicate-from it. */
export function toFormValues(version: VersionResponse): VersionFormValues {
  return {
    name: version.name,
    description: version.description ?? '',
    promptText: version.promptText,
    systemPrompt: version.systemPrompt ?? '',
    model: version.model,
    maxTokens: version.maxTokens,
    effort: version.effort,
    thinking: version.thinking,
    variables: version.variables.map((variable) => ({
      name: variable.name,
      description: variable.description ?? '',
      required: isRequired(variable),
      defaultValue: variable.defaultValue ?? '',
    })),
  }
}
