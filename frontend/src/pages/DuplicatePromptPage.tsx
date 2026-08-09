import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptForm } from '../components/PromptForm'
import {
  toFormValues,
  type PromptRequestBody,
} from '../components/promptFormValues'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import type { PromptResponse } from '../lib/types'

export function DuplicatePromptPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptResponse>(`/api/prompts/${id}`),
  })
  usePageTitle(prompt.data ? `Duplicate: ${prompt.data.name}` : 'Duplicate')

  const mutation = useMutation({
    mutationFn: (body: PromptRequestBody) =>
      apiClient.post<PromptResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}`),
  })

  if (prompt.isPending) {
    return <Loading />
  }
  if (prompt.isError || !prompt.data) {
    return <LoadError>Could not load this prompt.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} />
      <PromptForm
        initial={toFormValues(prompt.data)}
        submitLabel="Duplicate"
        submitClassName="button-inline"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
