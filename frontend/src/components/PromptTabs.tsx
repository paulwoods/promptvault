import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail } from '../lib/types'

interface PromptTabsProps {
  promptId: string
  /** The version that View/Edit/Run target. Defaults to the prompt's current version. */
  versionNumber?: number | string
}

/** Navigation between a prompt's pages: View, Edit, Run, Versions, Runs. */
export function PromptTabs({ promptId, versionNumber }: PromptTabsProps) {
  const detail = useQuery({
    queryKey: ['prompt', promptId],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${promptId}`),
    enabled: versionNumber == null,
  })

  const number =
    versionNumber ?? detail.data?.versions.find((v) => v.current)?.number

  return (
    <nav className="prompt-tabs" aria-label="Prompt">
      {number != null && (
        <>
          <NavLink to={`/prompts/${promptId}/versions/${number}`} end>
            View
          </NavLink>
          <NavLink to={`/prompts/${promptId}/versions/${number}/edit`}>
            Edit
          </NavLink>
          <NavLink to={`/prompts/${promptId}/versions/${number}/run`}>
            Run
          </NavLink>
        </>
      )}
      <NavLink to={`/prompts/${promptId}`} end>
        Versions
      </NavLink>
      <NavLink to={`/prompts/${promptId}/runs`}>Runs</NavLink>
    </nav>
  )
}
