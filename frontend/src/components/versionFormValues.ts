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

const PLACEHOLDER = /\{\{([\s\S]*?)\}\}/g
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Mirrors the server's Variable-name and placeholder/Variable set-equality rules
 * so a mismatch is caught before a round trip. Returns the first problem found,
 * or null when the form is consistent. Server validation stays the source of
 * truth -- names are checked unmodified, exactly as they are submitted.
 */
export function variableMismatch(
  promptText: string,
  variables: VariableRow[],
): string | null {
  const declared: string[] = []
  for (const row of variables) {
    if (!VARIABLE_NAME.test(row.name)) {
      return `Invalid variable name: ${row.name === '' ? '(empty)' : row.name}`
    }
    if (declared.includes(row.name)) {
      return `Duplicate variable name: ${row.name}`
    }
    declared.push(row.name)
  }

  const placeholders = new Set<string>()
  for (const match of promptText.matchAll(PLACEHOLDER)) {
    const inner = match[1].trim()
    if (!VARIABLE_NAME.test(inner)) {
      return `Malformed placeholder: {{${match[1]}}}`
    }
    placeholders.add(inner)
  }

  const undeclared = [...placeholders].filter(
    (name) => !declared.includes(name),
  )
  if (undeclared.length > 0) {
    return describe(undeclared, 'used in the prompt but not declared')
  }
  const unused = declared.filter((name) => !placeholders.has(name))
  if (unused.length > 0) {
    return describe(unused, 'not used in the prompt')
  }
  return null
}

/** "Variable {{a}} <problem>" for one name, "Variables {{a}}, {{b}} <problem>" for several. */
function describe(names: string[], problem: string): string {
  const label = names.length === 1 ? 'Variable' : 'Variables'
  const list = names.map((name) => `{{${name}}}`).join(', ')
  return `${label} ${list} ${problem}`
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
