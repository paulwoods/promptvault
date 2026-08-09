import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import {
  toFormValues,
  variableMismatch,
  type PromptRequestBody,
  type VariableRow,
} from '../components/promptFormValues'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import type { ModelsResponse, PromptResponse } from '../lib/types'

const EFFORTS = ['low', 'medium', 'high']

export function PromptConsolePage() {
  const { id = '' } = useParams()

  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptResponse>(`/api/prompts/${id}`),
  })
  usePageTitle(prompt.data ? `Console: ${prompt.data.name}` : 'Console')

  if (prompt.isPending) {
    return <Loading />
  }
  if (prompt.isError || !prompt.data) {
    return <LoadError>Could not load this prompt.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} />
      <ConsoleForm promptId={id} prompt={prompt.data} />
    </>
  )
}

interface ConsoleFormProps {
  promptId: string
  prompt: PromptResponse
}

/**
 * One inline-edited Prompt field. Read mode renders `stored` — the value from
 * the ['prompt', id] query — and edit mode a local draft, which makes PATCH the
 * field's only writer: a converted field leaves `values` and the PUT body, and
 * the PUT sources it from the query instead.
 *
 * Console-local rather than the shared useEditableField, which fits Profile and
 * not this: that hook PUTs a dedicated single-field endpoint, invalidates one
 * query key where this needs two of different prefixes, and gets Enter-to-commit
 * from each Profile field owning a <form> — which cannot nest inside ConsoleForm's.
 */
function useInlineField(promptId: string, field: string, stored: string) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<PromptResponse>(`/api/prompts/${promptId}`, {
        [field]: draft,
      }),
    onSuccess: (updated) => {
      // Written straight in rather than invalidated: the response is already the
      // authoritative new state, and an invalidate-only refetch would leave
      // `stored` stale for a round-trip — long enough for the Save button, which
      // now sources this field from the query, to revert the edit just committed.
      queryClient.setQueryData(['prompt', promptId], updated)
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      setEditing(false)
    },
  })

  // Blank matches @NotBlank exactly, so the server's rejection is unreachable
  // from the UI; unchanged refuses a no-op write, which still costs a list
  // invalidation (ADR-0008's "frequent and incidental writes" concern).
  const committable = draft.trim() !== '' && draft !== stored

  function commit() {
    if (committable && !save.isPending) {
      // Sent untrimmed: the PUT path does not trim, and trimming only here would
      // make the two writers disagree about the same field.
      save.mutate()
    }
  }

  return {
    value: editing ? draft : stored,
    editing,
    committable,
    save,
    commit,
    // Only reachable from read mode — the editor replaces the trigger that
    // calls it — so it needs no already-editing guard.
    beginEditing: () => {
      setDraft(stored)
      setEditing(true)
    },
    setDraft,
    cancel: () => setEditing(false),
  }
}

function CheckIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

/**
 * The Console's own copy of the prompt form, inlined off the shared PromptForm
 * so it can diverge into inline-editable fields (Phase 13). PromptForm stays
 * where it is, serving Create and Duplicate.
 *
 * Kept a separate component rather than folded into the page: it must not
 * mount until the prompt has loaded, because its state is seeded once from
 * that prompt and useState ignores its argument on every later render.
 */
function ConsoleForm({ promptId, prompt }: ConsoleFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })
  const [values, setValues] = useState(() => toFormValues(prompt))
  const [mismatch, setMismatch] = useState<string | null>(null)
  // Name is inline-edited, so it is no longer read from `values` — the field's
  // value comes from the query and PATCH is its only writer. `values.name` is
  // still populated by the shared toFormValues, but nothing here reads it.
  const name = useInlineField(promptId, 'name', prompt.name)

  // Fires immediately on click — no confirmation dialog, matching the app's
  // existing convention (ADR-0004): safe because Trash + restore make it low-stakes.
  const deletePrompt = useMutation({
    mutationFn: () => apiClient.delete(`/api/prompts/${promptId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate('/')
    },
  })

  // Saving overwrites the prompt; the previous content is not recoverable (ADR-0007).
  const mutation = useMutation({
    mutationFn: (body: PromptRequestBody) =>
      apiClient.put<PromptResponse>(`/api/prompts/${promptId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt', promptId] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate(`/prompts/${promptId}`)
    },
  })

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

  function updateVariable(index: number, patch: Partial<VariableRow>) {
    setValues((current) => ({
      ...current,
      variables: current.variables.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }))
  }

  function submit() {
    const problem = variableMismatch(values.promptText, values.variables)
    setMismatch(problem)
    if (problem !== null) {
      return
    }
    mutation.mutate({
      // Not values.name: Name is inline-edited, so the query — not this form —
      // holds its current value, and PromptRequest still requires the field.
      name: prompt.name,
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

  // A client-side mismatch means submit never fired, so any server error is stale.
  const alertMessage =
    mismatch ?? (mutation.error != null ? errorMessage(mutation.error) : null)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset className="form-section">
        <legend>Profile</legend>
        <div className="inline-field">
          {/* No <label>: read mode has no form control to label, so the field
              name is a span both modes point at with aria-labelledby. */}
          <span className="inline-field-name" id="name-label">
            Name
          </span>
          {name.editing ? (
            <div className="inline-field-row">
              <input
                name="name"
                aria-labelledby="name-label"
                placeholder="Name"
                // The click that opened the editor landed on the text, not this
                // input, so without it the user would have to click twice.
                autoFocus
                value={name.value}
                onChange={(event) => name.setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Without this the outer form submits and the PUT overwrites
                    // every other field from `values`.
                    event.preventDefault()
                    name.commit()
                  } else if (event.key === 'Escape') {
                    name.cancel()
                  }
                }}
              />
              <button
                type="button"
                className="inline-save"
                aria-label="Save name"
                title="Save name"
                disabled={!name.committable || name.save.isPending}
                onClick={name.commit}
              >
                <CheckIcon />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-value"
              id="name-value"
              // Names it "Name Greeting" rather than a bare "Greeting", keeping
              // the field context the layout conveys visually.
              aria-labelledby="name-label name-value"
              title="Edit name"
              onClick={name.beginEditing}
            >
              {name.value}
            </button>
          )}
        </div>
        {name.save.isError && (
          <ErrorAlert>{errorMessage(name.save.error)}</ErrorAlert>
        )}
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
              className="variable-remove"
              onClick={() =>
                setValues((c) => ({
                  ...c,
                  variables: c.variables.filter((_, i) => i !== index),
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="variable-add"
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

      <div className="actions">
        <button
          type="button"
          disabled={deletePrompt.isPending}
          onClick={() => deletePrompt.mutate()}
        >
          Delete
        </button>
        <button type="submit" disabled={mutation.isPending}>
          Save
        </button>
      </div>
      {deletePrompt.isError && (
        <ErrorAlert>{errorMessage(deletePrompt.error)}</ErrorAlert>
      )}
      {alertMessage != null && <ErrorAlert>{alertMessage}</ErrorAlert>}
    </form>
  )
}
