import { useState } from 'react'
import { ErrorAlert } from './ErrorAlert'
import { isRequired } from '../lib/types'
import type { VariableDeclaration } from '../lib/types'

interface RunFormProps {
  variables: VariableDeclaration[]
  pending?: boolean
  onRun: (values: Record<string, string>) => void
}

/**
 * Collects Variable values for a Run. Inputs are pre-filled from declared
 * defaults; required Variables are enforced client-side before running (story
 * 28) to avoid wasted tokens. Server validation remains the source of truth.
 */
export function RunForm({ variables, pending, onRun }: RunFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variables.map((variable) => [variable.name, variable.defaultValue ?? '']),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const missing = variables.filter(
      (variable) =>
        isRequired(variable) && (values[variable.name] ?? '').trim() === '',
    )
    if (missing.length > 0) {
      setError(
        `Please fill in: ${missing.map((variable) => variable.name).join(', ')}`,
      )
      return
    }
    setError(null)
    onRun(values)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {variables.map((variable) => (
        <label key={variable.name}>
          {variable.name}
          {isRequired(variable) ? ' (required)' : ''}
          <input
            aria-label={variable.name}
            value={values[variable.name] ?? ''}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [variable.name]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <button type="submit" disabled={pending}>
        Run
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </form>
  )
}
