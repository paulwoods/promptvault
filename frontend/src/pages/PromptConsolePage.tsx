import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { MarkdownEditor } from '../components/MarkdownEditor'
import type { PromptRequestBody } from '../components/promptFormValues'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import { useRunStream } from '../lib/useRunStream'
import type { ModelsResponse, PromptResponse } from '../lib/types'

const EFFORTS = ['low', 'medium', 'high']
const THINKING = ['off', 'adaptive']

// Appended to a prompt's name when duplicating it. The source name is
// truncated first so the result stays under the backend's @Size(max = 200)
// cap on PromptRequest.name -- otherwise duplicating a near-ceiling name 400s.
const COPY_SUFFIX = ' copy'
const NAME_MAX_LENGTH = 200

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
    <div className="console-layout">
      {/* Keyed so a move to another prompt (Duplicate lands on the copy)
          rebuilds the form: the live prompt fields seed their drafts from the
          prompt once, at mount, and would otherwise keep showing the previous
          prompt's text. */}
      <ConsoleForm key={id} promptId={id} prompt={prompt.data} />
      <RunPane promptId={id} />
    </div>
  )
}

/**
 * The right half of the Console: a Run button that fires the prompt at its
 * current stored content, and a tall read-only textarea beneath it that fills
 * with the run's output as it streams. The prompt is run as stored
 * (ADR-0009) — there are no per-run values to collect — so the prompt stays
 * editable on the left while the result accumulates here.
 */
function RunPane({ promptId }: { promptId: string }) {
  const { status, output, failure, run } = useRunStream(promptId)

  function handleRun() {
    run()
  }

  return (
    <section className="run-pane" aria-label="Run">
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
      <textarea
        className="run-output"
        aria-label="Run output"
        readOnly
        value={output}
      />
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
 * field's only writer.
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
  live = false,
) {
  const queryClient = useQueryClient()
  // Seeded from the stored value rather than blank: a live field is its own
  // editor from the first paint, so no beginEditing ever runs to seed it.
  const [draft, setDraft] = useState(stored)
  const [editing, setEditing] = useState(live)

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<PromptResponse>(`/api/prompts/${promptId}`, patch(draft)),
    onSuccess: (updated) => {
      // Written straight in rather than invalidated: the response is already the
      // authoritative new state, and an invalidate-only refetch would leave
      // `stored` stale for the round-trip — long enough for the field, which
      // sources its read-mode value from the query, to revert the edit just
      // committed.
      queryClient.setQueryData(['prompt', promptId], updated)
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      // A live field has no read mode to drop back to — it stays its own
      // editor, now sitting on the value the save just returned.
      setEditing(live)
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
    live,
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
    // Leaving edit mode is what discards the draft for a read/edit field. A
    // live field never leaves it, so there the draft has to be put back by
    // hand — same outcome, and the only way to undo an unsaved change.
    cancel: () => (live ? setDraft(stored) : setEditing(false)),
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

function CopyIcon() {
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
      <rect x="8" y="8" width="14" height="14" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
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
  /** Present ⇒ the editor is the markdown editor, which outranks `rows`. */
  markdown?: boolean
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
  markdown,
  fill,
  fixed,
  hideLabel,
}: InlineFieldProps) {
  const labelId = `${name}-label`
  const valueId = `${name}-value`
  const noun = label.toLowerCase()

  // Shared by the plain editors: Enter commits, Escape reverts. Without the
  // preventDefault the outer form submits and the PUT overwrites every other
  // field from `values`. The markdown editor binds its own keys instead —
  // CodeMirror swallows keystrokes before they reach React.
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
          // cannot, since the native dropdown arrow owns its right edge, and
          // the markdown editor already brings a frame of its own.
          <div
            className={
              options || markdown
                ? 'inline-field-row'
                : 'inline-field-row inline-field-box'
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
            ) : markdown ? (
              <MarkdownEditor
                value={field.value}
                onChange={field.setDraft}
                label={label}
                onCommit={field.commit}
              />
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
              // Enter types a newline in the markdown editor rather than
              // committing, so the chord that does needs somewhere to be said.
              title={markdown ? `Save ${noun} (Ctrl+Enter)` : `Save ${noun}`}
              disabled={!field.committable || field.save.isPending}
              onClick={field.commit}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="inline-cancel"
              // "Cancel edit" names leaving edit mode, which a live field never
              // does; there the button puts the stored value back instead.
              aria-label={field.live ? `Revert ${noun}` : `Cancel ${noun} edit`}
              title={field.live ? `Revert ${noun}` : `Cancel ${noun} edit`}
              // Nothing to put back until the draft has moved off the stored
              // value, which is the same test the save button uses.
              disabled={field.live && !field.committable}
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
 * The Console's inline-editable prompt form. Each field reads from the
 * ['prompt', id] query and PATCH is its only in-page writer; Create (from
 * Home) and Duplicate (the action below) are the other writers of a prompt.
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
  const [tab, setTab] = useState<'details' | 'userPrompt' | 'systemPrompt'>(
    'details',
  )
  // Every field below is inline-edited: each one's value comes from the query
  // and PATCH is its only writer. Description and System Prompt are optional:
  // '' is a value they can hold, and the blank string is what clears the
  // stored column.
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
  // The two prompt bodies are live: the markdown editor is the field, switching
  // between source and preview on its own toolbar, so there is no read mode to
  // click through first.
  const promptText = useInlineField(
    promptId,
    prompt.promptText,
    (draft) => ({ promptText: draft }),
    false,
    true,
  )
  const systemPrompt = useInlineField(
    promptId,
    prompt.systemPrompt ?? '',
    (draft) => ({ systemPrompt: draft }),
    true,
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

  // Duplicates the prompt as stored: POSTs a new prompt with the current
  // content and a "copy"-suffixed name, then lands on the copy's Console.
  // No confirmation, matching Delete (ADR-0004): the copy is trivial to remove.
  const duplicatePrompt = useMutation({
    mutationFn: () =>
      apiClient.post<PromptResponse>('/api/prompts', {
        name:
          prompt.name.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length) +
          COPY_SUFFIX,
        description: prompt.description ?? null,
        promptText: prompt.promptText,
        systemPrompt: prompt.systemPrompt ?? null,
        model: prompt.model,
        maxTokens: prompt.maxTokens,
        effort: prompt.effort,
        thinking: prompt.thinking,
      } satisfies PromptRequestBody),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate(`/prompts/${data.promptId}/console`)
    },
  })

  // The two actions sit side by side and both fire immediately; disable both
  // while either is in flight so their competing onSuccess navigations can't race.
  const actionPending = deletePrompt.isPending || duplicatePrompt.isPending

  // Read off the stored model, not a Model draft: an uncommitted pick must not
  // reshape the fields around it.
  const capability = models.data?.models.find(
    (entry) => entry.id === prompt.model,
  )
  const supportsEffort = capability?.supportsEffort ?? false
  const supportsAdaptive = capability?.supportsAdaptiveThinking ?? false

  if (models.isPending) {
    return <Loading />
  }

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

            <div className="actions">
              <button
                type="button"
                className="action-icon"
                disabled={actionPending}
                onClick={() => duplicatePrompt.mutate()}
                aria-label="Duplicate"
                title="Duplicate"
              >
                <CopyIcon />
              </button>
              <button
                type="button"
                className="action-icon"
                disabled={actionPending}
                onClick={() => deletePrompt.mutate()}
                aria-label="Delete"
                title="Delete"
              >
                <TrashIcon />
              </button>
            </div>
            {deletePrompt.isError && (
              <ErrorAlert>{errorMessage(deletePrompt.error)}</ErrorAlert>
            )}
            {duplicatePrompt.isError && (
              <ErrorAlert>{errorMessage(duplicatePrompt.error)}</ErrorAlert>
            )}
          </>
        )}
        {tab === 'userPrompt' && (
          <InlineField
            name="promptText"
            label="User Prompt"
            field={promptText}
            markdown
            fill
            hideLabel
          />
        )}
        {tab === 'systemPrompt' && (
          <InlineField
            name="systemPrompt"
            label="System Prompt"
            field={systemPrompt}
            markdown
            fill
            hideLabel
          />
        )}
      </form>
    </section>
  )
}
