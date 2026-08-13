import { useCallback, useMemo } from 'react'
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
  /** Run by the commit chord, the editor's stand-in for Enter. */
  onCommit: () => void
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
  onCommit,
}: MarkdownEditorProps) {
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
      // The click that opened the tab landed on the tab, not on this control,
      // so without it the user would have to click twice.
      autofocus: true,
      // Left on, EasyMDE appends a <link> to a Font Awesome CDN at construction.
      // The icons are bundled above, so that request would be a second copy from
      // a third party — and the only thing in the app fetched from one.
      autoDownloadFontAwesome: false,
    }),
    [label],
  )

  // Enter has to reach the editor as a newline, so the commit moves to the
  // chord. Both spellings are bound: CodeMirror maps Cmd- on macOS only.
  const extraKeys = useMemo(
    () => ({ 'Ctrl-Enter': onCommit, 'Cmd-Enter': onCommit }),
    [onCommit],
  )

  // The <textarea> EasyMDE was built from is hidden, and the one it types into
  // is CodeMirror's own — this is the only way to give that one a name.
  const nameForScreenReaders = useCallback(
    (codemirror: Editor) => {
      codemirror.setOption('screenReaderLabel', label)
    },
    [label],
  )

  return (
    <SimpleMdeReact
      className="markdown-editor"
      value={value}
      onChange={onChange}
      options={options}
      extraKeys={extraKeys}
      getCodemirrorInstance={nameForScreenReaders}
    />
  )
}
