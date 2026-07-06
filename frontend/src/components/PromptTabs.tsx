import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail } from '../lib/types'

interface PromptTabsProps {
  promptId: string
  /** The version that View/Edit/Run target. Defaults to the prompt's current version. */
  versionNumber?: number | string
  /** Whether {@link versionNumber} is the current version (controls the View tab URL). */
  current?: boolean
}

/** Navigation between a prompt's pages: View, Edit, Run, Duplicate, Versions, Runs. */
export function PromptTabs({
  promptId,
  versionNumber,
  current,
}: PromptTabsProps) {
  const detail = useQuery({
    queryKey: ['prompt', promptId],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${promptId}`),
    enabled: versionNumber == null,
  })

  const number =
    versionNumber ?? detail.data?.versions.find((v) => v.current)?.number
  // The current version lives at the clean /prompts/:id URL; a specific
  // historical version keeps its /versions/:number path.
  const isCurrent = current || versionNumber == null
  const base = isCurrent
    ? `/prompts/${promptId}`
    : `/prompts/${promptId}/versions/${number}`

  return (
    <nav className="prompt-tabs" aria-label="Prompt">
      {number != null && (
        <>
          <NavLink to={base} end>
            View
          </NavLink>
          <NavLink to={`${base}/edit`}>Edit</NavLink>
          <NavLink to={`${base}/run`}>Run</NavLink>
          <NavLink to={`${base}/duplicate`}>Duplicate</NavLink>
        </>
      )}
      <NavLink to={`/prompts/${promptId}/version`} end>
        Versions
      </NavLink>
      <NavLink to={`/prompts/${promptId}/runs`}>Runs</NavLink>
    </nav>
  )
}
