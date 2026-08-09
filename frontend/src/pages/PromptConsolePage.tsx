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
import { useRunStream } from '../lib/useRunStream'
import type { ModelsResponse, PromptResponse } from '../lib/types'

const EFFORTS = ['low', 'medium', 'high']
const THINKING = ['off', 'adaptive']

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
      <div className="console-layout">
        <ConsoleForm promptId={id} prompt={prompt.data} />
        <RunPane promptId={id} prompt={prompt.data} />
      </div>
    </>
  )
}

/**
 * The right half of the Console: a Run button that fires the prompt at its
 * current stored values, and a tall read-only textarea beneath it that fills
 * with the run's output as it streams. Reuses the same plumbing the dedicated
 * Run page does (useRunStream) so the prompt stays editable on the left while
 * the result accumulates here. Variables are sent at their declared default
 * values — the Console is for shaping the prompt, and a variable that needs a
 * fresh value each run belongs on the Run page.
 */
function RunPane({
  promptId,
  prompt,
}: {
  promptId: string
  prompt: PromptResponse
}) {
  const { status, output, failure, run } = useRunStream(promptId)

  function handleRun() {
    const values = Object.fromEntries(
      prompt.variables.map((variable) => [
        variable.name,
        variable.defaultValue ?? '',
      ]),
    )
    run(values)
  }

  return (
    <section className="run-pane" aria-label="Run">
      <div className="run-output-wrap">
        <textarea
          className="run-output"
          aria-label="Run output"
          readOnly
          value={output}
        />
        <button
          type="button"
          className="run-button button-gold"
          onClick={handleRun}
          disabled={status === 'running'}
          aria-label={status === 'running' ? 'Running…' : 'Run prompt'}
          title={status === 'running' ? 'Running…' : 'Run prompt'}
        >
          <PlayIcon />
        </button>
      </div>
      {failure && <ErrorAlert>{failure}</ErrorAlert>}
    </section>
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
 *
 * `patch` builds the request body from the draft, rather than the hook assuming
 * `{field: draft}`: Max tokens is a number, and Model has to carry a Thinking
 * correction when the model it moves to cannot do adaptive thinking.
 */
function useInlineField(
  promptId: string,
  stored: string,
  patch: (draft: string) => Record<string, unknown>,
  optional = false,
) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<PromptResponse>(`/api/prompts/${promptId}`, patch(draft)),
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
  // from the UI; an optional field has no such rule, and its blank string is
  // how a full save clears the column, so blank stays committable there.
  // Unchanged refuses a no-op write either way, which still costs a list
  // invalidation (ADR-0008's "frequent and incidental writes" concern).
  const committable = (optional || draft.trim() !== '') && draft !== stored

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

function PlayIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 5l13 7-13 7z" />
    </svg>
  )
}

function XIcon() {
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
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

interface InlineFieldProps {
  /** The Prompt's field name — the control's `name` and the prefix of the aria ids. */
  name: string
  /** Displayed beside the value, and the stem of every accessible name here. */
  label: string
  field: ReturnType<typeof useInlineField>
  /** Read-mode stand-in for a blank value; only an optional field can need one. */
  emptyLabel?: string
  /** Present ⇒ the editor is a <select> over these; absent ⇒ a text input. */
  options?: readonly string[]
  /** A numeric field, so the editor gets the number keyboard and steppers. */
  numeric?: boolean
  /** Present ⇒ the editor is a <textarea> with this many rows, not an input. */
  rows?: number
  /** Present ⇒ the field fills most of the viewport height (prompt editors). */
  fill?: boolean
  /** No legal alternative to the stored value — reads as text, with no editor. */
  fixed?: boolean
  /** Hide the visible name — the surrounding context (e.g. the tab) already
   * labels the field, so the name is redundant visually but kept for screen
   * readers via aria-labelledby. */
  hideLabel?: boolean
}

/**
 * The read/edit pair for one inline-edited field: the stored value as text
 * until clicked, then an editor with commit and cancel buttons.
 */
function InlineField({
  name,
  label,
  field,
  emptyLabel,
  options,
  numeric,
  rows,
  fill,
  fixed,
  hideLabel,
}: InlineFieldProps) {
  const labelId = `${name}-label`
  const valueId = `${name}-value`
  const noun = label.toLowerCase()

  // Shared by both editors: Enter commits, Escape reverts. Without the
  // preventDefault the outer form submits and the PUT overwrites every other
  // field from `values`.
  function onKeyDown(event: { key: string; preventDefault: () => void }) {
    if (event.key === 'Enter') {
      event.preventDefault()
      field.commit()
    } else if (event.key === 'Escape') {
      field.cancel()
    }
  }

  return (
    <>
      <div className={`inline-field${fill ? ' inline-field-fill' : ''}`}>
        {/* No <label>: read mode has no form control to label, so the field
            name is a span both modes point at with aria-labelledby. Hidden
            when the surrounding context already names the field. */}
        <span
          className={`inline-field-name${hideLabel ? ' visually-hidden' : ''}`}
          id={labelId}
        >
          {label}
        </span>
        {field.editing ? (
          // A text editor draws its own frame around the buttons; a <select>
          // cannot, since the native dropdown arrow owns its right edge.
          <div
            className={
              options ? 'inline-field-row' : 'inline-field-row inline-field-box'
            }
          >
            {options ? (
              <select
                name={name}
                aria-labelledby={labelId}
                // The click that opened the editor landed on the text, not this
                // control, so without it the user would have to click twice.
                autoFocus
                value={field.value}
                onChange={(event) => field.setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : rows ? (
              <textarea
                name={name}
                aria-labelledby={labelId}
                placeholder={label}
                autoFocus
                rows={rows}
                value={field.value}
                onChange={(event) => field.setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              />
            ) : (
              <input
                name={name}
                type={numeric ? 'number' : 'text'}
                aria-labelledby={labelId}
                placeholder={label}
                autoFocus
                value={field.value}
                onChange={(event) => field.setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              />
            )}
            <button
              type="button"
              className="inline-save"
              aria-label={`Save ${noun}`}
              title={`Save ${noun}`}
              disabled={!field.committable || field.save.isPending}
              onClick={field.commit}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="inline-cancel"
              aria-label={`Cancel ${noun} edit`}
              title={`Cancel ${noun} edit`}
              onClick={field.cancel}
            >
              <XIcon />
            </button>
          </div>
        ) : fixed ? (
          // Nothing to pick, so nothing to click: an editor here would open on
          // a single option and dead-end at a disabled commit button.
          <span className="inline-value inline-value-fixed">{field.value}</span>
        ) : (
          <button
            type="button"
            className="inline-value"
            id={valueId}
            // Names it "Name Greeting" rather than a bare "Greeting", keeping
            // the field context the layout conveys visually.
            aria-labelledby={`${labelId} ${valueId}`}
            title={`Edit ${noun}`}
            onClick={field.beginEditing}
          >
            {field.value === '' ? (
              <span className="inline-value-empty">{emptyLabel}</span>
            ) : (
              field.value
            )}
          </button>
        )}
      </div>
      {field.save.isError && (
        <ErrorAlert>{errorMessage(field.save.error)}</ErrorAlert>
      )}
    </>
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
  const [tab, setTab] = useState<'details' | 'userPrompt' | 'systemPrompt'>(
    'details',
  )
  // Every field below is inline-edited, so none is read from `values` — each
  // one's value comes from the query and PATCH is its only writer. toFormValues
  // still seeds `values` with all of them, but only the variables are read back
  // from it. Description and System Prompt are optional: '' is a value they can
  // hold, and the blank string is what clears the stored column.
  const name = useInlineField(promptId, prompt.name, (draft) => ({
    name: draft,
  }))
  const description = useInlineField(
    promptId,
    prompt.description ?? '',
    (draft) => ({ description: draft }),
    true,
  )
  const model = useInlineField(promptId, prompt.model, (draft) => {
    // Adaptive thinking on a model that lacks it is the one combination the
    // server rejects outright, so moving to such a model has to carry the
    // correction in the same request — there is no order in which two separate
    // patches are both valid.
    const next = models.data?.models.find((entry) => entry.id === draft)
    return next?.supportsAdaptiveThinking || prompt.thinking !== 'adaptive'
      ? { model: draft }
      : { model: draft, thinking: 'off' }
  })
  const maxTokens = useInlineField(
    promptId,
    String(prompt.maxTokens),
    (draft) => ({ maxTokens: Number(draft) }),
  )
  const effort = useInlineField(promptId, prompt.effort, (draft) => ({
    effort: draft,
  }))
  const thinking = useInlineField(promptId, prompt.thinking, (draft) => ({
    thinking: draft,
  }))
  const promptText = useInlineField(promptId, prompt.promptText, (draft) => ({
    promptText: draft,
  }))
  const systemPrompt = useInlineField(
    promptId,
    prompt.systemPrompt ?? '',
    (draft) => ({ systemPrompt: draft }),
    true,
  )

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

  // Read off the stored model, not a Model draft: an uncommitted pick must not
  // reshape the fields around it.
  const capability = models.data?.models.find(
    (entry) => entry.id === prompt.model,
  )
  const supportsEffort = capability?.supportsEffort ?? false
  const supportsAdaptive = capability?.supportsAdaptiveThinking ?? false

  function updateVariable(index: number, patch: Partial<VariableRow>) {
    setValues((current) => ({
      ...current,
      variables: current.variables.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }))
  }

  function submit() {
    const problem = variableMismatch(prompt.promptText, values.variables)
    setMismatch(problem)
    if (problem !== null) {
      return
    }
    mutation.mutate({
      // Only the variables still come from this form. Every other field is
      // inline-edited, so the query — not `values` — holds its current value,
      // and PromptRequest still carries them all.
      name: prompt.name,
      description: prompt.description ?? null,
      promptText: prompt.promptText,
      systemPrompt:
        prompt.systemPrompt && prompt.systemPrompt.trim() !== ''
          ? prompt.systemPrompt
          : null,
      model: prompt.model,
      maxTokens: prompt.maxTokens,
      effort: prompt.effort,
      thinking: prompt.thinking,
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
    <section className="console-form">
      <nav className="console-tabs" aria-label="Console sections">
        <button
          type="button"
          aria-current={tab === 'details' ? 'true' : undefined}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          aria-current={tab === 'userPrompt' ? 'true' : undefined}
          onClick={() => setTab('userPrompt')}
        >
          User Prompt
        </button>
        <button
          type="button"
          aria-current={tab === 'systemPrompt' ? 'true' : undefined}
          onClick={() => setTab('systemPrompt')}
        >
          System Prompt
        </button>
      </nav>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {tab === 'details' && (
          <>
            <InlineField name="name" label="Name" field={name} />
            <InlineField
              name="description"
              label="Description"
              field={description}
              emptyLabel="Add a description"
              rows={3}
            />
            <InlineField
              name="model"
              label="Model"
              field={model}
              options={models.data?.models.map((entry) => entry.id) ?? []}
            />
            <InlineField
              name="maxTokens"
              label="Max tokens"
              field={maxTokens}
              numeric
            />
            {supportsEffort && (
              <InlineField
                name="effort"
                label="Effort"
                field={effort}
                options={EFFORTS}
              />
            )}
            <InlineField
              name="thinking"
              label="Thinking"
              field={thinking}
              options={THINKING}
              // Off is the only legal value on a model without adaptive thinking,
              // so the field reads as text there instead of offering the choice.
              fixed={!supportsAdaptive}
            />
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
                    {
                      name: '',
                      description: '',
                      required: true,
                      defaultValue: '',
                    },
                  ],
                }))
              }
            >
              Add variable
            </button>

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
          </>
        )}
        {tab === 'userPrompt' && (
          <InlineField
            name="promptText"
            label="User Prompt"
            field={promptText}
            fill
            hideLabel
          />
        )}
        {tab === 'systemPrompt' && (
          <InlineField
            name="systemPrompt"
            label="System Prompt"
            field={systemPrompt}
            emptyLabel="Add a system prompt"
            fill
            hideLabel
          />
        )}
      </form>
    </section>
  )
}
