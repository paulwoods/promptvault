import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
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

const THINKING = ['off', 'adaptive']

// Appended to a prompt's name when duplicating it. The source name is
// truncated first so the result stays under the backend's @Size(max = 200)
// cap on PromptRequest.name -- otherwise duplicating a near-ceiling name 400s.
const COPY_SUFFIX = ' copy'
const NAME_MAX_LENGTH = 200

// A live field saves itself (ADR-0012): one PATCH a second after the typing
// stops, and one every ten seconds if it never stops — a plain debounce never
// fires for a fast continuous typist, so a body typed into without a pause
// would otherwise never be written at all.
const AUTOSAVE_IDLE_MS = 1000
const AUTOSAVE_CEILING_MS = 10000

/**
 * Where a self-saving field stands. `empty` is separate from `unsaved` because
 * it is the one state the User has to act on: promptText is @NotBlank, so the
 * save is held rather than sent to be rejected, and it stays held until there
 * is something to write.
 */
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'empty' | 'failed'

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  empty: "Can't be empty",
  failed: "Couldn't save",
}

// The states worth a mark on a tab you are not looking at. `saving` is not one
// of them: it resolves on its own, and a marker that blinks past is noise.
const STATUS_NEEDS_ATTENTION: Record<SaveStatus, boolean> = {
  saved: false,
  saving: false,
  unsaved: true,
  empty: true,
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
 * What both halves of the Console need to agree on: whether the bodies are
 * safe to run against, and how to make them so.
 */
interface BodySaves {
  /** A run would read the wrong text, and no write can fix it. */
  blocked: boolean
  /** Writes both bodies and resolves once they have landed. Rejects if one fails. */
  flush: () => Promise<void>
  /** Drops pending saves and stops any later flush — for a Prompt being deleted. */
  discard: () => void
}

/**
 * The Console proper, mounted only once the Prompt has loaded.
 *
 * The two self-saving bodies are held here rather than inside the form because
 * the Run pane depends on them: a run reads the *stored* Prompt (ADR-0009), so
 * Run has to write what is on screen before it streams, and only a component
 * above both can hand it the means to.
 */
function Console({ promptId, prompt }: ConsoleFormProps) {
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

  // Set by Delete. A discarded Console must not write on the way out, and its
  // unmount flush below runs after the navigation that Delete triggers.
  const discarded = useRef(false)

  const bodies: BodySaves = {
    // A blank User Prompt is never written (it is @NotBlank), so a flush would
    // leave the previous text stored and the run would quietly use that.
    blocked: promptText.status === 'empty',
    flush: async () => {
      if (discarded.current) {
        return
      }
      await Promise.all([promptText.flush(), systemPrompt.flush()])
    },
    discard: () => {
      discarded.current = true
      promptText.cancelPending()
      systemPrompt.cancelPending()
    },
  }

  // Leaving the Console in-app writes whatever is pending, best-effort: the
  // mutation outlives the unmount, and nothing here waits on it. A failed
  // final write cannot surface in a page that is gone, but it is still logged
  // rather than swallowed — the failure should be findable, not silent.
  // beforeunload covers closing the tab instead — this cannot.
  const flushOnLeave = useRef(bodies.flush)
  useEffect(() => {
    flushOnLeave.current = bodies.flush
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
      <ConsoleForm
        promptId={promptId}
        prompt={prompt}
        promptText={promptText}
        systemPrompt={systemPrompt}
        bodies={bodies}
      />
      <RunPane promptId={promptId} bodies={bodies} />
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
function RunPane({
  promptId,
  bodies,
}: {
  promptId: string
  bodies: BodySaves
}) {
  const { status, output, failure, run, stop } = useRunStream(promptId)
  const [flushError, setFlushError] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)

  async function handleRun() {
    setFlushError(null)
    setFlushing(true)
    try {
      // The backend reads the stored Prompt, so the only way to make the output
      // match the screen is to make the screen the stored Prompt first.
      await bodies.flush()
    } catch (error) {
      // A run against text the server does not have is worse than no run.
      setFlushError(errorMessage(error))
      return
    } finally {
      setFlushing(false)
    }
    run()
  }

  const running = status === 'running'
  const busy = running || flushing
  const label = bodies.blocked
    ? 'Run prompt — the User Prompt cannot be empty'
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
          disabled={busy || bodies.blocked}
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
      {failure && <ErrorAlert>{failure}</ErrorAlert>}
    </section>
  )
}

interface ConsoleFormProps {
  promptId: string
  prompt: PromptResponse
}

interface ConsoleFormBodies {
  promptText: ReturnType<typeof useInlineField>
  systemPrompt: ReturnType<typeof useInlineField>
  bodies: BodySaves
}

/**
 * Warns before the tab closes while there is uncommitted work.
 *
 * Registered per field rather than once for the Console: the fields are split
 * across two components (the bodies sit above the form so Run can flush them),
 * and any one handler cancelling the event is enough to raise the dialog — so
 * there is nothing to gain from lifting a boolean through both.
 *
 * In-app navigation is deliberately not guarded (ADR-0012): abandoning a
 * Details edit by navigating away works exactly as it always has, and a body's
 * pending save is flushed on unmount rather than lost.
 */
function useUnloadGuard(uncommitted: boolean) {
  useEffect(() => {
    if (!uncommitted) {
      return
    }
    // Cancelling the event is the whole of it — browsers show their own wording
    // and ignore any message we supply.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uncommitted])
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
  // Bumped every time a save is sent. It is what re-arms the ceiling timer
  // below, which is otherwise deliberately blind to the typing.
  const [sends, setSends] = useState(0)

  // A timer fires outside the render that scheduled it, so it reads the draft
  // through a ref rather than through a closure that has since gone stale.
  const draftRef = useRef(draft)

  // Two saves can be in flight at once — the ceiling firing while a debounced
  // save is still on the wire — and the slower can land last. Each response
  // carries the order its request went out in, and only one newer than the last
  // applied is allowed to write the cache.
  const sent = useRef(0)
  const landed = useRef(0)

  const save = useMutation({
    mutationFn: async (value: string) => {
      sent.current += 1
      const sequence = sent.current
      const updated = await apiClient.patch<PromptResponse>(
        `/api/prompts/${promptId}`,
        patch(value),
      )
      return { sequence, updated }
    },
    onSuccess: ({ sequence, updated }) => {
      if (sequence < landed.current) {
        return
      }
      landed.current = sequence
      // Written straight in rather than invalidated: the response is already the
      // authoritative new state, and an invalidate-only refetch would leave
      // `stored` stale for the round-trip — long enough for the field, which
      // sources its read-mode value from the query, to revert the edit just
      // committed.
      queryClient.setQueryData(['prompt', promptId], updated)
      // Marks the list stale without refetching it: it is unmounted while the
      // Console is open, which is what makes a save cheap enough to debounce.
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      // A live field has no read mode to drop back to — it stays its own
      // editor, now sitting on the value the save just returned.
      setEditing(live)
    },
  })

  // Blank matches @NotBlank exactly, so the server's rejection is unreachable
  // from the UI; an optional field has no such rule, and its blank string is
  // how a full save clears the column, so blank stays committable there. For a
  // live field this is also what *holds* the save rather than sending a request
  // that could only 400.
  const committable = (optional || draft.trim() !== '') && draft !== stored

  // Work the tab would take with it. Wider than `committable` on purpose: a
  // blank User Prompt is held rather than sent, and a save that failed leaves
  // the draft ahead of `stored` — both are still the User's typing. A closed
  // Details editor is not, since its draft is re-seeded the next time it opens.
  useUnloadGuard(editing && draft !== stored)

  // `save` itself is not a dependency anywhere below: its identity changes as
  // the mutation moves through pending, which would re-arm both timers mid-save
  // and write the field twice for one edit.
  const saveRef = useRef(save)

  // Kept current in an effect rather than assigned during render: a timer only
  // ever reads these after the commit that scheduled it, so there is nothing to
  // gain from writing them earlier.
  useEffect(() => {
    draftRef.current = draft
    saveRef.current = save
  })

  const send = useCallback(() => {
    // Sent untrimmed: the PUT path does not trim, and trimming only here would
    // make the two writers disagree about the same field.
    saveRef.current.mutate(draftRef.current)
    setSends((count) => count + 1)
  }, [])

  // Both timers are also held in refs so Run, Duplicate and Delete can reach
  // in and stop them — an effect cleanup only fires when React decides to
  // re-run the effect, which is too late for a click that has to write, or
  // must not write, right now.
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ceilingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Reset by every keystroke, so it fires once the typing settles.
  useEffect(() => {
    if (!live || !committable) {
      return
    }
    idleTimer.current = setTimeout(send, AUTOSAVE_IDLE_MS)
    return () => clearTimeout(idleTimer.current)
  }, [live, committable, draft, sends, send])

  // Deliberately not keyed on `draft`: this one has to survive the keystrokes
  // that keep resetting the timer above. It re-arms on `sends` instead, so an
  // unbroken hour of typing is written every ten seconds rather than once.
  useEffect(() => {
    if (!live || !committable) {
      return
    }
    ceilingTimer.current = setTimeout(send, AUTOSAVE_CEILING_MS)
    return () => clearTimeout(ceilingTimer.current)
  }, [live, committable, sends, send])

  // Drops whatever was scheduled without writing it. Nothing re-arms until the
  // next keystroke, which is what makes this safe for Delete.
  const cancelPending = useCallback(() => {
    clearTimeout(idleTimer.current)
    clearTimeout(ceilingTimer.current)
  }, [])

  /**
   * Writes the draft now and resolves when it has landed, so a caller that
   * reads the stored Prompt afterwards reads what is on screen. Rejects if the
   * PATCH does — the caller decides what a failed write means.
   */
  async function flush() {
    cancelPending()
    if (!committable) {
      return
    }
    await save.mutateAsync(draft)
  }

  function commit() {
    if (committable && !save.isPending) {
      send()
    }
  }

  // Ordered by what the User can do about it. Blank comes first because it is
  // why nothing is being sent; pending outranks the last failure so a retry
  // does not still read as broken while it is in flight.
  const status: SaveStatus =
    !optional && draft.trim() === ''
      ? 'empty'
      : save.isPending
        ? 'saving'
        : save.isError
          ? 'failed'
          : committable
            ? 'unsaved'
            : 'saved'

  return {
    value: editing ? draft : stored,
    editing,
    live,
    committable,
    status,
    save,
    commit,
    flush,
    cancelPending,
    // Only reachable from read mode — the editor replaces the trigger that
    // calls it — so it needs no already-editing guard.
    beginEditing: () => {
      setDraft(stored)
      setEditing(true)
    },
    setDraft,
    // Leaving edit mode is what discards the draft. A live field never leaves
    // it and has no cancel gesture left to reach this (ADR-0012 deleted the
    // revert button along with the commit one); its undo is the editor's own.
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
  promptText,
  systemPrompt,
  bodies,
}: ConsoleFormProps & ConsoleFormBodies) {
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
    // Moving to a model whose capabilities exclude what the Prompt currently
    // carries — adaptive thinking on one that lacks it, an effort level the
    // target does not accept — has to carry the corrections in the same
    // request: the server validates the merged result, so there is no order
    // in which two separate patches are each valid.
    const next = models.data?.models.find((entry) => entry.id === draft)
    if (!next) {
      return { model: draft }
    }
    const corrections: { model: string; effort?: string; thinking?: string } = {
      model: draft,
    }
    if (prompt.thinking === 'adaptive' && !next.supportsAdaptiveThinking) {
      corrections.thinking = 'off'
    }
    if (!next.effortLevels.includes(prompt.effort)) {
      // 'medium' — the app default (new prompts are born with it) and the one
      // level the catalog guarantees every model accepts.
      corrections.effort = 'medium'
    }
    return corrections
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
      // The copy is taken from the query cache, so an unwritten body would be
      // duplicated at its previous text. Writing first is what makes the copy
      // match the screen — the same reason Run flushes.
      await bodies.flush()
      const source =
        queryClient.getQueryData<PromptResponse>(['prompt', promptId]) ?? prompt
      return apiClient.post<PromptResponse>('/api/prompts', {
        name:
          source.name.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length) +
          COPY_SUFFIX,
        description: source.description ?? null,
        promptText: source.promptText,
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
                  bodies.discard()
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
