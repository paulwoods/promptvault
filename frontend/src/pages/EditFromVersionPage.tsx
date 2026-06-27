import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { VersionForm } from '../components/VersionForm'
import type {
  VersionFormValues,
  VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import type { VersionResponse } from '../lib/types'

function toFormValues(version: VersionResponse): VersionFormValues {
  return {
    name: version.name,
    description: version.description ?? '',
    promptText: version.promptText,
    systemPrompt: version.systemPrompt ?? '',
    model: version.model,
    maxTokens: version.maxTokens,
    effort: version.effort,
    thinking: version.thinking,
    variables: version.variables.map((variable) => ({
      name: variable.name,
      description: variable.description ?? '',
      required: variable.required ?? true,
      defaultValue: variable.defaultValue ?? '',
    })),
  }
}

export function EditFromVersionPage() {
  const { id = '', number = '' } = useParams()
  const navigate = useNavigate()

  const version = useQuery({
    queryKey: ['version', id, number],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${number}`),
  })

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>(`/api/prompts/${id}/versions`, body),
    onSuccess: () => navigate(`/prompts/${id}`),
  })

  if (version.isPending) {
    return <Loading />
  }
  if (version.isError || !version.data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} versionNumber={number} />
      <PageHeader title="Edit (new version)" />
      <VersionForm
        initial={toFormValues(version.data)}
        submitLabel="Save new version"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
