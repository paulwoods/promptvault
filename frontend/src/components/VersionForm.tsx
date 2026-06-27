import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { ModelsResponse } from '../lib/types'
import type {
  VariableRow,
  VersionFormValues,
  VersionRequestBody,
} from './versionFormValues'

const EFFORTS = ['low', 'medium', 'high']

interface VersionFormProps {
  initial: VersionFormValues
  submitLabel: string
  pending: boolean
  error: unknown
  onSubmit: (body: VersionRequestBody) => void
}

export function VersionForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: VersionFormProps) {
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
      thinking: next?.supportsAdaptiveThinking ? current.thinking : 'off',
    }))
  }

  function updateVariable(index: number, patch: Partial<VariableRow>) {
    setValues((current) => ({
      ...current,
      variables: current.variables.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
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
      variables: values.variables.map((row) => ({
        name: row.name,
        description: row.description === '' ? null : row.description,
        required: row.required,
        defaultValue: row.defaultValue === '' ? null : row.defaultValue,
      })),
    })
  }

  if (models.isPending) {
    return <Loading />
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
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
      <label>
        Prompt text
        <textarea
          name="promptText"
          placeholder="Prompt text"
          value={values.promptText}
          onChange={(event) =>
            setValues((c) => ({ ...c, promptText: event.target.value }))
          }
          required
        />
      </label>
      <label>
        System prompt
        <textarea
          name="systemPrompt"
          placeholder="System prompt"
          value={values.systemPrompt}
          onChange={(event) =>
            setValues((c) => ({ ...c, systemPrompt: event.target.value }))
          }
        />
      </label>
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
            setValues((c) => ({ ...c, maxTokens: Number(event.target.value) }))
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

      <fieldset>
        <legend>Variables</legend>
        {values.variables.map((row, index) => (
          <div key={index}>
            <input
              aria-label={`Variable ${index + 1} name`}
              placeholder="Variable name"
              value={row.name}
              onChange={(event) =>
                updateVariable(index, { name: event.target.value })
              }
            />
            <label>
              Required
              <input
                type="checkbox"
                checked={row.required}
                onChange={(event) =>
                  updateVariable(index, { required: event.target.checked })
                }
              />
            </label>
            <input
              aria-label={`Variable ${index + 1} default`}
              placeholder="Default value"
              value={row.defaultValue}
              onChange={(event) =>
                updateVariable(index, { defaultValue: event.target.value })
              }
            />
            <button
              type="button"
              onClick={() =>
                setValues((c) => ({
                  ...c,
                  variables: c.variables.filter((_, i) => i !== index),
                }))
              }
            >
              Remove variable {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setValues((c) => ({
              ...c,
              variables: [
                ...c.variables,
                { name: '', description: '', required: true, defaultValue: '' },
              ],
            }))
          }
        >
          Add variable
        </button>
      </fieldset>

      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
      {error != null && <ErrorAlert>{errorMessage(error)}</ErrorAlert>}
    </form>
  )
}
