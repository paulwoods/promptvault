import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail } from '../lib/types'

export function PromptDetailPage() {
  const { id = '' } = useParams()
  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${id}`),
  })

  // Version pickers for the diff view (9.6) — default to the oldest and
  // newest Version so the common "what changed since the first one" case
  // needs no interaction, but either select can be changed to compare any
  // two arbitrary Versions.
  const [fromNumber, setFromNumber] = useState('')
  const [toNumber, setToNumber] = useState('')
  const versions = prompt.data?.versions ?? []
  const name = versions.find((v) => v.current)?.name
  const effectiveFrom = fromNumber || String(versions[0]?.number ?? '')
  const effectiveTo =
    toNumber || String(versions[versions.length - 1]?.number ?? '')

  return (
    <>
      <PromptTabs promptId={id} />
      <PageHeader title={name ? `Versions: ${name}` : 'Versions'} />
      {prompt.isPending && <Loading />}
      {prompt.isError && <LoadError>Could not load this prompt.</LoadError>}
      {prompt.data && (
        <ul>
          {prompt.data.versions.map((version) => (
            <li key={version.versionId}>
              <Link to={`/prompts/${id}/versions/${version.number}`}>
                {version.name} (v{version.number})
              </Link>
              <Link
                to={`/prompts/${id}/versions/${version.number}/edit`}
                className="button-link button-link-sm"
              >
                Create New Version
              </Link>
            </li>
          ))}
        </ul>
      )}
      {prompt.data && prompt.data.versions.length >= 2 && (
        <section>
          <h2>Compare versions</h2>
          <div className="compare-picker">
            <label>
              From
              <select
                aria-label="From version"
                value={effectiveFrom}
                onChange={(event) => setFromNumber(event.target.value)}
              >
                {prompt.data.versions.map((version) => (
                  <option key={version.versionId} value={version.number}>
                    {version.name} (v{version.number})
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                aria-label="To version"
                value={effectiveTo}
                onChange={(event) => setToNumber(event.target.value)}
              >
                {prompt.data.versions.map((version) => (
                  <option key={version.versionId} value={version.number}>
                    {version.name} (v{version.number})
                  </option>
                ))}
              </select>
            </label>
            <Link
              to={`/prompts/${id}/compare?from=${effectiveFrom}&to=${effectiveTo}`}
              className="button-link button-link-sm"
            >
              Compare
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
