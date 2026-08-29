/** The body of a create or duplicate POST to /api/prompts. */
export interface PromptRequestBody {
  name: string
  description: string | null
  /** Null means empty (ADR-0013) — either prompt body may be blank. */
  promptText: string | null
  systemPrompt: string | null
  model: string
  maxTokens: number
  effort: string
  thinking: string
}
