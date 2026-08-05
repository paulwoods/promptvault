import { useQuery } from '@tanstack/react-query'
import { diffWords } from 'diff'
import { Fragment } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import { isRequired } from '../lib/types'
import type { VariableDeclaration, VersionResponse } from '../lib/types'

function formatVariables(variables: VariableDeclaration[]): string {
  if (variables.length === 0) {
    return '(none)'
  }
  return variables
    .map((variable) => {
      const required = isRequired(variable) ? ', required' : ''
      const defaultValue = variable.defaultValue
        ? `, default "${variable.defaultValue}"`
        : ''
      return `${variable.name}${required}${defaultValue}`
    })
    .join('; ')
}

interface FieldDiff {
  label: string
  from: string
  to: string
}

/** Every frozen field other than prompt_text — shown only when it differs. */
function fieldDiffs(from: VersionResponse, to: VersionResponse): FieldDiff[] {
  const diffs: FieldDiff[] = []
  function addIfChanged(label: string, fromValue: string, toValue: string) {
    if (fromValue !== toValue) {
      diffs.push({ label, from: fromValue, to: toValue })
    }
  }

  addIfChanged('Name', from.name, to.name)
  addIfChanged('Description', from.description ?? '', to.description ?? '')
  addIfChanged('Model', from.model, to.model)
  addIfChanged('System prompt', from.systemPrompt ?? '', to.systemPrompt ?? '')
  addIfChanged('Max tokens', String(from.maxTokens), String(to.maxTokens))
  addIfChanged('Effort', from.effort, to.effort)
  addIfChanged('Thinking', from.thinking, to.thinking)
  addIfChanged(
    'Variables',
    formatVariables(from.variables),
    formatVariables(to.variables),
  )
  return diffs
}

export function CompareVersionsPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const fromNumber = searchParams.get('from') ?? ''
  const toNumber = searchParams.get('to') ?? ''
  const hasParams = fromNumber !== '' && toNumber !== ''

  const fromVersion = useQuery({
    queryKey: ['version', id, fromNumber],
    queryFn: () =>
      apiClient.get<VersionResponse>(
        `/api/prompts/${id}/versions/${fromNumber}`,
      ),
    enabled: hasParams,
  })
  const toVersion = useQuery({
    queryKey: ['version', id, toNumber],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${toNumber}`),
    enabled: hasParams,
  })
  usePageTitle(
    fromVersion.data && toVersion.data
      ? `Compare v${fromVersion.data.number} → v${toVersion.data.number}`
      : 'Compare',
  )

  if (!hasParams) {
    return <LoadError>Could not load these versions.</LoadError>
  }
  if (fromVersion.isPending || toVersion.isPending) {
    return <Loading />
  }
  if (
    fromVersion.isError ||
    toVersion.isError ||
    !fromVersion.data ||
    !toVersion.data
  ) {
    return <LoadError>Could not load these versions.</LoadError>
  }

  const from = fromVersion.data
  const to = toVersion.data
  const textDiff = diffWords(from.promptText, to.promptText)
  const changedFields = fieldDiffs(from, to)

  return (
    <>
      <PromptTabs promptId={id} />
      <section>
        <h2>Prompt text</h2>
        <pre>
          {textDiff.map((part, index) => {
            if (part.added) {
              return (
                <ins key={index} className="diff-added">
                  {part.value}
                </ins>
              )
            }
            if (part.removed) {
              return (
                <del key={index} className="diff-removed">
                  {part.value}
                </del>
              )
            }
            return <Fragment key={index}>{part.value}</Fragment>
          })}
        </pre>
      </section>
      <section>
        <h2>Other changes</h2>
        {changedFields.length === 0 && (
          <p className="muted">No other differences.</p>
        )}
        {changedFields.length > 0 && (
          <dl>
            {changedFields.map((field) => (
              <Fragment key={field.label}>
                <dt>{field.label}</dt>
                <dd>
                  {field.from || '(empty)'} → {field.to || '(empty)'}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}
      </section>
    </>
  )
}
