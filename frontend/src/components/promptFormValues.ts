/** The body of a create or duplicate POST to /api/prompts. */
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
