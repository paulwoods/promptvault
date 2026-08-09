import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { ModelsResponse } from '../lib/types'
import type { PromptFormValues, PromptRequestBody } from './promptFormValues'

const EFFORTS = ['low', 'medium', 'high']

interface PromptFormProps {
  initial: PromptFormValues
  submitLabel: string
  submitClassName?: string
  pending: boolean
  error: unknown
  onSubmit: (body: PromptRequestBody) => void
}

export function PromptForm({
  initial,
  submitLabel,
  submitClassName,
  pending,
  error,
  onSubmit,
}: PromptFormProps) {
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })
  const [values, setValues] = useState(initial)

  const capability = models.data?.models.find(
    (model) => model.id === values.model,
  )
  const supportsEffort = capability?.supportsEffort ?? false
  const supportsAdaptive = capability?.supportsAdaptiveThinking ?? false

  function selectModel(modelId: string) {
    const next = models.data?.models.find((model) => model.id === modelId)
    setValues((current) => ({
      ...current,
      model: modelId,
      effort: next?.supportsEffort ? current.effort : 'medium',
      thinking: next?.supportsAdaptiveThinking ? current.thinking : 'off',
    }))
  }

  function submit() {
    onSubmit({
      name: values.name,
      description: values.description.trim() === '' ? null : values.description,
      promptText: values.promptText,
      systemPrompt:
        values.systemPrompt.trim() === '' ? null : values.systemPrompt,
      model: values.model,
      maxTokens: values.maxTokens,
      effort: values.effort,
      thinking: values.thinking,
    })
  }

  if (models.isPending) {
    return <Loading />
  }

  const alertMessage = error != null ? errorMessage(error) : null

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset className="form-section">
        <legend>Profile</legend>
        <label>
          Name
          <input
            name="name"
            placeholder="Name"
            value={values.name}
            onChange={(event) =>
              setValues((c) => ({ ...c, name: event.target.value }))
            }
            required
          />
        </label>
        <label>
          Description
          <input
            name="description"
            placeholder="Description"
            value={values.description}
            onChange={(event) =>
              setValues((c) => ({ ...c, description: event.target.value }))
            }
          />
        </label>
      </fieldset>
      <fieldset className="form-section">
        <legend>Prompt</legend>
        <div className="prompt-columns">
          <label>
            User Prompt
            <textarea
              name="promptText"
              placeholder="User Prompt"
              value={values.promptText}
              onChange={(event) =>
                setValues((c) => ({ ...c, promptText: event.target.value }))
              }
              required
            />
          </label>
          <label>
            System Prompt
            <textarea
              name="systemPrompt"
              placeholder="System Prompt"
              value={values.systemPrompt}
              onChange={(event) =>
                setValues((c) => ({ ...c, systemPrompt: event.target.value }))
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Configuration</legend>
        <div className="settings-columns">
          <label>
            Model
            <select
              value={values.model}
              onChange={(event) => selectModel(event.target.value)}
            >
              {models.data?.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Max tokens
            <input
              type="number"
              name="maxTokens"
              placeholder="Max tokens"
              value={values.maxTokens}
              onChange={(event) =>
                setValues((c) => ({
                  ...c,
                  maxTokens: Number(event.target.value),
                }))
              }
            />
          </label>
          {supportsEffort && (
            <label>
              Effort
              <select
                value={values.effort}
                onChange={(event) =>
                  setValues((c) => ({ ...c, effort: event.target.value }))
                }
              >
                {EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Thinking
            <select
              value={values.thinking}
              disabled={!supportsAdaptive}
              onChange={(event) =>
                setValues((c) => ({ ...c, thinking: event.target.value }))
              }
            >
              <option value="off">off</option>
              {supportsAdaptive && <option value="adaptive">adaptive</option>}
            </select>
          </label>
        </div>
      </fieldset>

      <button type="submit" className={submitClassName} disabled={pending}>
        {submitLabel}
      </button>
      {alertMessage != null && <ErrorAlert>{alertMessage}</ErrorAlert>}
    </form>
  )
}
