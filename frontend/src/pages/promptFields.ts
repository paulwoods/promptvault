/**
 * The Prompt Console's field layer: one inline-edited field, the eight of them
 * a Prompt has, and the seam every action that reads the *stored* Prompt
 * crosses first. Console-local by design (ADR-0012) — a sibling module rather
 * than a shared hook, for the same reasons `useInlineField` is not
 * `useEditableField`. `PromptConsolePage` owns the rendering; this owns when a
 * field is written.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../lib/apiClient'
import type { ModelsResponse, PromptResponse } from '../lib/types'

// A live field saves itself (ADR-0012): one PATCH a second after the typing
// stops, and one every ten seconds if it never stops — a plain debounce never
// fires for a fast continuous typist, so a body typed into without a pause
// would otherwise never be written at all.
const AUTOSAVE_IDLE_MS = 1000
const AUTOSAVE_CEILING_MS = 10000

/**
 * Where a self-saving field stands. Blank is a legal stored value for both
 * bodies (ADR-0013), so there is no "empty" state to name: a blank body reads
 * as `saved` and a blank draft autosaves like anything else.
 */
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed'

/**
 * What every action that reads the *stored* Prompt has to cross first. The
 * backend answers from what is stored (ADR-0009), so "what runs is what is on
 * screen" holds only if the screen is written first.
 */
export interface FlushSeam {
  /**
   * Writes every field with something to write, and resolves once they have
   * all landed. Rejects if any write does — the caller decides what a failed
   * write means. Unqualified because flushing everything is the normal case.
   */
  flush: () => Promise<void>
  /**
   * The two bodies only, for unmount. A body has no discard gesture *because*
   * it is always live, so leaving must write it; a Details field's discard
   * gesture *is* leaving (ADR-0012). Flushing all eight here would turn
   * backing out of an edit into a silent save with no undo. Named for the
   * moment it serves, so the unmount effect reads as deliberate at exactly the
   * site where calling the wrong verb causes that bug.
   */
  flushOnLeave: () => Promise<void>
  /** Stops everything not yet written — for a Prompt on its way to Trash. */
  discard: () => void
  /** Why Run is refused, in words fit for the button; null when it is not. */
  blockedReason: string | null
}

export type PromptField = ReturnType<typeof useInlineField>

/** The Prompt's eight inline-edited fields, and the seam that spans them. */
export interface PromptFields extends FlushSeam {
  name: PromptField
  description: PromptField
  model: PromptField
  maxTokens: PromptField
  effort: PromptField
  thinking: PromptField
  systemPrompt: PromptField
  promptText: PromptField
}

/**
 * One owner for the whole field set. Every field already exposed `flush`,
 * `cancelPending` and `committable`; what was missing was something holding
 * all eight, so that one seam could cover them rather than the two bodies
 * alone — an open Model or Max tokens editor used to stream the *previous*
 * value with no indication.
 *
 * Not a context-registration scheme: the field set is statically eight, and
 * registering them would make "which fields does Run flush?" answerable only
 * at runtime.
 */
export function usePromptFields(
  promptId: string,
  prompt: PromptResponse,
): PromptFields {
  // The same query key ConsoleForm uses, so this is one request and one cache
  // entry: the catalog is read here for the Model corrections below, and there
  // for what the form renders.
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })

  const name = useInlineField({
    promptId,
    label: 'Name',
    stored: prompt.name,
    patch: (draft) => ({ name: draft }),
  })
  // Description and the two bodies are optional: '' is a value they can hold,
  // and the blank string is what clears the stored column.
  const description = useInlineField({
    promptId,
    label: 'Description',
    stored: prompt.description ?? '',
    patch: (draft) => ({ description: draft }),
    optional: true,
  })
  const model = useInlineField({
    promptId,
    label: 'Model',
    stored: prompt.model,
    patch: (draft) => {
      // Moving to a model whose capabilities exclude what the Prompt currently
      // carries — adaptive thinking on one that lacks it, an effort level the
      // target does not accept — has to carry the corrections in the same
      // request: the server validates the merged result, so there is no order
      // in which two separate patches are each valid.
      const next = models.data?.models.find((entry) => entry.id === draft)
      if (!next) {
        return { model: draft }
      }
      const corrections: { model: string; effort?: string; thinking?: string } =
        { model: draft }
      if (prompt.thinking === 'adaptive' && !next.supportsAdaptiveThinking) {
        corrections.thinking = 'off'
      }
      if (!next.effortLevels.includes(prompt.effort)) {
        // 'medium' — the app default (new prompts are born with it) and the one
        // level the catalog guarantees every model accepts.
        corrections.effort = 'medium'
      }
      return corrections
    },
  })
  const maxTokens = useInlineField({
    promptId,
    label: 'Max tokens',
    stored: String(prompt.maxTokens),
    patch: (draft) => ({ maxTokens: Number(draft) }),
  })
  const effort = useInlineField({
    promptId,
    label: 'Effort',
    stored: prompt.effort,
    patch: (draft) => ({ effort: draft }),
  })
  const thinking = useInlineField({
    promptId,
    label: 'Thinking',
    stored: prompt.thinking,
    patch: (draft) => ({ thinking: draft }),
  })
  const systemPrompt = useInlineField({
    promptId,
    label: 'System Prompt',
    stored: prompt.systemPrompt ?? '',
    patch: (draft) => ({ systemPrompt: draft }),
    optional: true,
    live: true,
  })
  const promptText = useInlineField({
    promptId,
    label: 'User Prompt',
    stored: prompt.promptText ?? '',
    // Optional like the System Prompt since ADR-0013: blank is how the body is
    // cleared, and it autosaves rather than being held.
    patch: (draft) => ({ promptText: draft }),
    optional: true,
    live: true,
  })

  // Declaration order, which is also top-to-bottom on the Details tab.
  const all = [
    name,
    description,
    model,
    maxTokens,
    effort,
    thinking,
    systemPrompt,
    promptText,
  ]
  const bodies = [systemPrompt, promptText]

  // Set by Delete. A discarded Console must not write on the way out, and its
  // unmount flush runs after the navigation that Delete triggers.
  const discarded = useRef(false)

  const flushEach = async (fields: PromptField[]) => {
    if (discarded.current) {
      return
    }
    await Promise.all(fields.map((field) => field.flush()))
  }

  return {
    name,
    description,
    model,
    maxTokens,
    effort,
    thinking,
    systemPrompt,
    promptText,
    flush: () => flushEach(all),
    flushOnLeave: () => flushEach(bodies),
    discard: () => {
      discarded.current = true
      // A no-op for the six, which own no timers. It costs nothing and lets the
      // verb mean one thing: stop everything not yet written.
      all.forEach((field) => field.cancelPending())
    },
    // Read from the drafts (for the live bodies, `value` *is* the draft), so
    // typing the last character away disables Run before the autosave lands —
    // the backend would refuse the same run with a 400.
    blockedReason:
      promptText.value.trim() === '' && systemPrompt.value.trim() === ''
        ? 'add a System Prompt or User Prompt first'
        : null,
  }
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
function useInlineField({
  promptId,
  label,
  stored,
  patch,
  optional = false,
  live = false,
}: {
  promptId: string
  /** How the field is named to the User — on its row, and in anything the seam says about it. */
  label: string
  stored: string
  patch: (draft: string) => Record<string, unknown>
  optional?: boolean
  live?: boolean
}) {
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

  // A required field holds a blank save rather than sending a request the
  // server's @NotBlank could only 400. Name is the only one that can reach
  // that state by typing — the other required fields are selects and a number.
  // An optional field has no such rule: its blank string is how the stored
  // column is cleared, which since ADR-0013 means both prompt bodies as well
  // as Description, so neither live field is ever held.
  const committable = (optional || draft.trim() !== '') && draft !== stored

  // Uncommitted *and* unsendable: the User has typed something the field
  // refuses to write. Only a required field can reach it, by being blanked —
  // Name and Max tokens are the two that can be typed empty. A flush cannot
  // resolve it, so the seam blocks the Run on it rather than running against
  // the stored value while the screen shows something else.
  const held = editing && draft !== stored && !committable

  // Work the tab would take with it. Wider than `committable` on purpose: a
  // blank Name is held rather than sent, and a save that failed leaves the
  // draft ahead of `stored` — both are still the User's typing. A closed
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
    if (committable) {
      if (!save.isPending) {
        send()
      }
    } else if (!live && draft === stored) {
      // Nothing to write: Enter on an unchanged draft reads as "done", so it
      // closes the editor. A blank draft fails the `draft === stored` test and
      // stays held — closing would discard the typing that got it there.
      setEditing(false)
    }
  }

  // Ordered by what the User can do about it: pending outranks the last
  // failure so a retry does not still read as broken while it is in flight.
  const status: SaveStatus = save.isPending
    ? 'saving'
    : save.isError
      ? 'failed'
      : committable
        ? 'unsaved'
        : 'saved'

  return {
    label,
    value: editing ? draft : stored,
    editing,
    live,
    committable,
    held,
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
