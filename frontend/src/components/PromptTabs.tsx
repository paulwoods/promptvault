import { NavLink } from 'react-router'

interface PromptTabsProps {
  promptId: string
}

/** Navigation between a prompt's pages: View, Edit, Run, Duplicate. */
export function PromptTabs({ promptId }: PromptTabsProps) {
  const base = `/prompts/${promptId}`

  return (
    <nav className="prompt-tabs" aria-label="Prompt">
      <NavLink to={base} end>
        View
      </NavLink>
      <NavLink to={`${base}/edit`}>Edit</NavLink>
      <NavLink to={`${base}/run`}>Run</NavLink>
      <NavLink to={`${base}/duplicate`}>Duplicate</NavLink>
    </nav>
  )
}
