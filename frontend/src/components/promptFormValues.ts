import type { PromptResponse } from '../lib/types'

export interface PromptFormValues {
  name: string
  description: string
  promptText: string
  systemPrompt: string
  model: string
  maxTokens: number
  effort: string
  thinking: string
}

export interface PromptRequestBody {
  name: string
  description: string | null
  promptText: string
  systemPrompt: string | null
  model: string
  maxTokens: number
  effort: string
  thinking: string
}

export function emptyPromptValues(defaultModel: string): PromptFormValues {
  return {
    name: '',
    description: '',
    promptText: '',
    systemPrompt: '',
    model: defaultModel,
    maxTokens: 1000,
    effort: 'medium',
    thinking: 'off',
  }
}

/** Seeds form values from an existing Prompt -- used to edit or duplicate it. */
export function toFormValues(prompt: PromptResponse): PromptFormValues {
  return {
    name: prompt.name,
    description: prompt.description ?? '',
    promptText: prompt.promptText,
    systemPrompt: prompt.systemPrompt ?? '',
    model: prompt.model,
    maxTokens: prompt.maxTokens,
    effort: prompt.effort,
    thinking: prompt.thinking,
  }
}
