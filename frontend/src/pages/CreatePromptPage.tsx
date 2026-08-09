import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptForm } from '../components/PromptForm'
import {
  emptyPromptValues,
  type PromptRequestBody,
} from '../components/promptFormValues'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import type { ModelsResponse, PromptResponse } from '../lib/types'

export function CreatePromptPage() {
  const navigate = useNavigate()
  usePageTitle('New prompt')
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })

  const mutation = useMutation({
    mutationFn: (body: PromptRequestBody) =>
      apiClient.post<PromptResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}`),
  })

  if (models.isPending) {
    return <Loading />
  }
  if (models.isError || !models.data) {
    return <LoadError>Could not load models.</LoadError>
  }

  return (
    <PromptForm
      initial={emptyPromptValues(models.data.defaultModel)}
      submitLabel="Create prompt"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(body) => mutation.mutate(body)}
    />
  )
}
