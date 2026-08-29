import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { MarkdownEditor } from '../components/MarkdownEditor'
import type { PromptRequestBody } from '../components/promptFormValues'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import type { RunFailureCategory } from '../lib/streamRun'
import { useRunStream } from '../lib/useRunStream'
import type { ModelsResponse, PromptResponse } from '../lib/types'
import type {
  FlushSeam,
  PromptField,
  PromptFields,
  SaveStatus,
} from './promptFields'
import { FieldSaveError, usePromptFields } from './promptFields'

const THINKING = ['off', 'adaptive']

// Where a failed run sends the User, by category. The run module reports what
// went wrong; only the app knows its own URL map, so the lookup lives here.
// A category with no entry is reported in place and goes nowhere.
const FAILURE_DESTINATION: Partial<Record<RunFailureCategory, string>> = {
  AUTH: '/settings/api-key',
}

// What a failed run says, by category. The backend's own message names the
// failure; these name what the User can do about it, which is why the category
// is carried at all. TRUNCATED and OTHER are absent on purpose: the first
// already arrives phrased for the User, and the second is whatever the server
// said — inventing wording for a failure we have not classified would say less.
const FAILURE_WORDING: Partial<Record<RunFailureCategory, string>> = {
  AUTH: 'Claude would not accept this API key.',
  RATE_LIMIT:
    'Claude is rate limiting this API key. Wait a moment, then run again.',
  OVERLOADED:
    'Claude is temporarily overloaded. Try the run again in a moment.',
  NETWORK:
    'The run could not reach Claude. Check your connection and try again.',
}

// The categories that say "this would have worked a minute ago": running again
// is the whole of the fix, so the alert carries the button that does it.
const TRANSIENT: Partial<Record<RunFailureCategory, true>> = {
  RATE_LIMIT: true,
  OVERLOADED: true,
}

// Appended to a prompt's name when duplicating it. The source name is
// truncated first so the result stays under the backend's @Size(max = 200)
// cap on PromptRequest.name -- otherwise duplicating a near-ceiling name 400s.
const COPY_SUFFIX = ' copy'
const NAME_MAX_LENGTH = 200

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  failed: "Couldn't save",
}

// The states worth a mark on a tab you are not looking at. `saving` is not one
// of them: it resolves on its own, and a marker that blinks past is noise.
const STATUS_NEEDS_ATTENTION: Record<SaveStatus, boolean> = {
  saved: false,
  saving: false,
  unsaved: true,
  failed: true,
}

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

  // Keyed so a move to another prompt (Duplicate lands on the copy) rebuilds
  // everything below: the live prompt fields seed their drafts from the prompt
  // once, at mount, and would otherwise keep showing the previous prompt's text.
  return <Console key={id} promptId={id} prompt={prompt.data} />
}

/**
 * The Console proper, mounted only once the Prompt has loaded.
 *
 * The field set is held here rather than inside the form because the Run pane
 * depends on it: a run reads the *stored* Prompt (ADR-0009), so Run has to
 * write what is on screen before it streams, and only a component above both
 * can hand it the means to.
 */
function Console({ promptId, prompt }: ConsoleFormProps) {
  const fields = usePromptFields(promptId, prompt)

  // Leaving the Console in-app writes whatever the bodies have pending,
  // best-effort: the mutation outlives the unmount, and nothing here waits on
  // it. A failed final write cannot surface in a page that is gone, but it is
  // still logged rather than swallowed — the failure should be findable, not
  // silent. beforeunload covers closing the tab instead — this cannot.
  //
  // Deliberately `flushOnLeave` and not `flush`: the six Details fields are
  // discarded by leaving, which is their cancel gesture (ADR-0012).
  const flushOnLeave = useRef(fields.flushOnLeave)
  useEffect(() => {
    flushOnLeave.current = fields.flushOnLeave
  })
  useEffect(
    () => () => {
      void flushOnLeave.current().catch((error: unknown) => {
        console.error('Final Console save on leaving was rejected', error)
      })
    },
    [],
  )

  return (
    <div className="console-layout">
      <ConsoleForm promptId={promptId} prompt={prompt} fields={fields} />
      <RunPane promptId={promptId} seam={fields} />
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
function RunPane({ promptId, seam }: { promptId: string; seam: FlushSeam }) {
  const { status, output, failure, run, stop } = useRunStream(promptId)
  const [flushError, setFlushError] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)
  const navigate = useNavigate()

  // A failure the User can only act on somewhere else takes them there: a run
  // that failed for want of an API key is asking for the key page, whether the
  // endpoint refused before the stream opened or Claude refused part-way in.
  const destination = failure
    ? FAILURE_DESTINATION[failure.category]
    : undefined
  useEffect(() => {
    if (destination) {
      navigate(destination)
    }
  }, [destination, navigate])

  async function handleRun() {
    setFlushError(null)
    setFlushing(true)
    try {
      // The backend reads the stored Prompt, so the only way to make the output
      // match the screen is to make the screen the stored Prompt first.
      await seam.flush()
    } catch (error) {
      // A run against content the server does not have is worse than no run.
      // Named, because the field that failed may be behind a closed tab.
      setFlushError(
        error instanceof FieldSaveError
          ? `Could not save ${error.field}: ${errorMessage(error.cause)}`
          : errorMessage(error),
      )
      return
    } finally {
      setFlushing(false)
    }
    run()
  }

  const running = status === 'running'
  const busy = running || flushing
  const label = seam.blockedReason
    ? `Run prompt — ${seam.blockedReason}`
    : busy
      ? 'Running…'
      : 'Run prompt'

  return (
    <section className="run-pane" aria-label="Run">
      <div className="run-controls">
        <button
          type="button"
          className="run-button button-gold"
          onClick={handleRun}
          disabled={busy || seam.blockedReason !== null}
          aria-label={label}
          title={label}
        >
          <PlayIcon />
        </button>
        {/* Rendered only while a stream is live — the one time it can do
            anything, and the one time the User is looking for it. A stopped
            run's output stays; a failed one reports below. */}
        {running && (
          <button
            type="button"
            className="run-button run-stop"
            onClick={stop}
            aria-label="Stop run"
            title="Stop run"
          >
            <StopIcon />
          </button>
        )}
      </div>
      <textarea
        className="run-output"
        aria-label="Run output"
        readOnly
        value={output}
      />
      {flushError && <ErrorAlert>{flushError}</ErrorAlert>}
      {failure && (
        <ErrorAlert>
          {FAILURE_WORDING[failure.category] ?? failure.message}
          {TRANSIENT[failure.category] && (
            // The same handler the Run button uses, flush included: a
            // rate-limited User waits, edits, and then retries, so assuming
            // nothing changed since the failure is wrong in the ordinary case.
            <button type="button" className="run-retry" onClick={handleRun}>
              Retry run
            </button>
          )}
        </ErrorAlert>
      )}
    </section>
  )
}

interface ConsoleFormProps {
  promptId: string
  prompt: PromptResponse
}

interface ConsoleFormFields {
  fields: PromptFields
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

function StopIcon() {
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
      <rect x="6" y="6" width="12" height="12" rx="2" />
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
  field: PromptField
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
  /** Markdown only: whether this field's tab is the one showing. */
  active?: boolean
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
  active = true,
  fill,
  fixed,
  hideLabel,
}: InlineFieldProps) {
  const labelId = `${name}-label`
  const valueId = `${name}-value`
  const noun = label.toLowerCase()

  // Shared by the plain editors: Enter commits — or, on an unchanged draft,
  // closes the editor — Escape reverts. Without the
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
                active={active}
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
            {/* A live field saves itself, so it has no commit gesture and no
                revert: its undo is the editor's own Ctrl+Z (ADR-0012), which is
                why the editor is hidden rather than unmounted between tabs. */}
            {!field.live && (
              <>
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
              </>
            )}
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
      {/* Only a self-saving field has a save state worth naming: every other
          one is written by a click the User just made. It is a live region
          because it changes without anything being clicked. */}
      {field.live && (
        <p className={`save-status save-status-${field.status}`} role="status">
          {STATUS_LABEL[field.status]}
        </p>
      )}
      {field.save.isError && (
        <ErrorAlert>{errorMessage(field.save.error)}</ErrorAlert>
      )}
    </>
  )
}

/**
 * A tab for one of the two self-saving bodies. It carries a dot when that body
 * has work the User would not otherwise see — while a body is off screen, its
 * tab is the only thing left that can speak for it.
 */
function BodyTab({
  label,
  status,
  current,
  onSelect,
}: {
  label: string
  status: SaveStatus
  current: boolean
  onSelect: () => void
}) {
  const marked = STATUS_NEEDS_ATTENTION[status]
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      // The dot is decorative, so the state has to reach the name some other
      // way. Not a nested visually-hidden span: accessible names are computed
      // by trimming each node and concatenating, which would run the label and
      // the state together as one word.
      aria-label={marked ? `${label} ${STATUS_LABEL[status]}` : undefined}
      onClick={onSelect}
    >
      {label}
      {marked && (
        <span className="tab-marker" aria-hidden="true">
          •
        </span>
      )}
    </button>
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
function ConsoleForm({
  promptId,
  prompt,
  fields,
}: ConsoleFormProps & ConsoleFormFields) {
  const {
    name,
    description,
    model,
    maxTokens,
    effort,
    thinking,
    systemPrompt,
    promptText,
  } = fields
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })
  const [tab, setTab] = useState<'details' | 'userPrompt' | 'systemPrompt'>(
    'details',
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
    mutationFn: async () => {
      // The copy is taken from the query cache, so an unwritten field would be
      // duplicated at its previous value. Writing first is what makes the copy
      // match the screen — the same reason Run flushes.
      await fields.flush()
      const source =
        queryClient.getQueryData<PromptResponse>(['prompt', promptId]) ?? prompt
      return apiClient.post<PromptResponse>('/api/prompts', {
        name:
          source.name.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length) +
          COPY_SUFFIX,
        description: source.description ?? null,
        promptText: source.promptText ?? null,
        systemPrompt: source.systemPrompt ?? null,
        model: source.model,
        maxTokens: source.maxTokens,
        effort: source.effort,
        thinking: source.thinking,
      } satisfies PromptRequestBody)
    },
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
  const alwaysThinking = capability?.alwaysThinking ?? false

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
        <BodyTab
          label="System Prompt"
          status={systemPrompt.status}
          current={tab === 'systemPrompt'}
          onSelect={() => setTab('systemPrompt')}
        />
        <BodyTab
          label="User Prompt"
          status={promptText.status}
          current={tab === 'userPrompt'}
          onSelect={() => setTab('userPrompt')}
        />
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
                options={capability?.effortLevels ?? []}
              />
            )}
            {!alwaysThinking && (
              <InlineField
                name="thinking"
                label="Thinking"
                field={thinking}
                options={THINKING}
                // Off is the only legal value on a model without adaptive thinking,
                // so the field reads as text there instead of offering the choice.
                fixed={!supportsAdaptive}
              />
            )}

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
                // Cancels rather than flushes: a Prompt on its way to Trash has
                // no use for one last write of what was being typed.
                onClick={() => {
                  fields.discard()
                  deletePrompt.mutate()
                }}
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
        {/* Unlike Details above, the two bodies are rendered whichever tab is
            showing and the inactive one is hidden. Their markdown editors hold
            the only undo there is (ADR-0012), so unmounting one on a trip to
            another tab would throw its history away. `hidden` is also what
            keeps it out of the accessibility tree while it is off screen. */}
        <div className="console-body" hidden={tab !== 'systemPrompt'}>
          <InlineField
            name="systemPrompt"
            label="System Prompt"
            field={systemPrompt}
            markdown
            active={tab === 'systemPrompt'}
            fill
            hideLabel
          />
        </div>
        <div className="console-body" hidden={tab !== 'userPrompt'}>
          <InlineField
            name="promptText"
            label="User Prompt"
            field={promptText}
            markdown
            active={tab === 'userPrompt'}
            fill
            hideLabel
          />
        </div>
      </form>
    </section>
  )
}
