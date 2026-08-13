import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Options } from 'easymde'
import type { Editor } from 'codemirror'
import SimpleMdeReact from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
// EasyMDE draws its toolbar with Font Awesome class names and ships no icons of
// its own, so without these the toolbar is a row of blank buttons. The v4 shim
// is what resolves the handful of v4-era names EasyMDE still emits, and only
// the two families those names land in are pulled in.
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import '@fortawesome/fontawesome-free/css/v4-shims.min.css'

interface MarkdownEditorProps {
  /** The markdown source, verbatim. */
  value: string
  onChange: (value: string) => void
  /** Names the field for screen readers, and stands in as the placeholder. */
  label: string
  /**
   * Whether the editor's tab is the one showing. It stays mounted either way —
   * CodeMirror's history is the only undo (ADR-0012) — so this is what tells it
   * it has just been revealed and needs to measure itself again.
   */
  active: boolean
}

/**
 * The editor behind the Console's two prompt fields: EasyMDE, a markdown source
 * pane with a formatting toolbar and a preview toggle.
 *
 * Source-only on purpose. `value` is the exact string sent to the model — a
 * prompt runs as stored (ADR-0009) — so the toolbar inserts markdown syntax
 * into the text and nothing here rewrites or normalises what was typed. A
 * WYSIWYG editor would change the prompt out from under the run.
 *
 * Everything below is memoised because SimpleMdeReact treats these as effect
 * dependencies: a fresh `options` object tears the editor down and builds a new
 * one, which would drop the cursor on every keystroke.
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  active,
}: MarkdownEditorProps) {
  const codemirror = useRef<Editor | null>(null)
  // Whether this editor has ever been shown. The first reveal stands in for the
  // `autofocus` option dropped below, which put the cursor at the end of the
  // document; later reveals leave the cursor where the user left it.
  const revealed = useRef(false)

  const options = useMemo<Options>(
    () => ({
      placeholder: label,
      // A prompt is full of names, jargon and template syntax, so the red
      // underlines would be noise rather than signal.
      spellChecker: false,
      // The word count it shows is about prose; a prompt is measured in tokens,
      // which the Details tab already carries.
      status: false,
      // EasyMDE's default floor is 300px, written straight onto the scroller as
      // an inline style. The field is already sized to fill its tab, so that
      // floor only shows up as an inner scrollbar on a short viewport.
      minHeight: '0',
      // No `autofocus`: it only fires at construction, and this editor is
      // constructed while its tab is hidden. Focus is driven by the activation
      // effect below instead — and it has to be, because `options` is memoised
      // and any change to that object's identity rebuilds the editor.
      // Left on, EasyMDE appends a <link> to a Font Awesome CDN at construction.
      // The icons are bundled above, so that request would be a second copy from
      // a third party — and the only thing in the app fetched from one.
      autoDownloadFontAwesome: false,
    }),
    [label],
  )

  // The <textarea> EasyMDE was built from is hidden, and the one it types into
  // is CodeMirror's own — this is the only way to give that one a name. The
  // instance is kept as well: it is the only handle on the editor, and the
  // activation effect needs it.
  const captureEditor = useCallback(
    (editor: Editor) => {
      codemirror.current = editor
      editor.setOption('screenReaderLabel', label)
    },
    [label],
  )

  // A hidden editor is display:none, which CodeMirror measures as a zero-height
  // viewport and then caches — so on reveal it renders no lines until told to
  // measure again. EasyMDE's `autoRefresh` option does not cover this: the addon
  // arms once, only if the wrapper is already zero-height at construction, and
  // calls stopListening the first time it fires.
  useEffect(() => {
    const editor = codemirror.current
    if (!active || !editor) {
      return
    }
    editor.refresh()
    editor.focus()
    if (!revealed.current) {
      revealed.current = true
      // What the dropped `autofocus` did: land the cursor after the stored text
      // so the tab opens ready to continue it, not to prepend to it.
      editor.setCursor(editor.lineCount(), 0)
    }
  }, [active])

  return (
    <SimpleMdeReact
      className="markdown-editor"
      value={value}
      onChange={onChange}
      options={options}
      getCodemirrorInstance={captureEditor}
    />
  )
}
