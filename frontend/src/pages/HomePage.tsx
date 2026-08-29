import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { Loading } from '../components/Loading'
import type { PromptRequestBody } from '../components/promptFormValues'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import type {
  ModelsResponse,
  Page,
  PromptResponse,
  PromptSummary,
} from '../lib/types'

// The defaults a New Prompt is created with. The Console opens on the created
// prompt, so every field is one inline-edit away from something useful. Both
// prompt bodies start blank: empty is a first-class state (ADR-0013), so a new
// prompt begins that way. Model is deliberately absent: it is the one field
// the backend catalogue owns, and copying its default here would drift the
// moment the catalogue renames one.
const NEW_PROMPT_BODY: Omit<PromptRequestBody, 'model'> = {
  name: 'New prompt',
  description: '',
  promptText: '',
  systemPrompt: '',
  maxTokens: 1000,
  effort: 'medium',
  thinking: 'adaptive',
}

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  usePageTitle('Your Prompts')
  // New Prompt skips the form: it creates a prompt from NEW_PROMPT_BODY and
  // drops straight onto the Console, where the inline editors take over.
  const createPrompt = useMutation({
    mutationFn: async () => {
      // fetchQuery answers from the cache the Console's ['models'] query
      // keeps warm, and only goes to the wire when there is none yet — so
      // the click never waits on the catalogue for more than one GET.
      const catalog = await queryClient.fetchQuery({
        queryKey: ['models'],
        queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
      })
      return apiClient.post<PromptResponse>('/api/prompts', {
        ...NEW_PROMPT_BODY,
        model: catalog.defaultModel,
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate(`/prompts/${data.promptId}/console`)
    },
  })
  // The search box itself lives in the top nav; this page reads what it writes.
  const [searchParams] = useSearchParams()
  const q = useDebouncedValue(searchParams.get('q') ?? '')
  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['prompts', q],
    queryFn: ({ pageParam }) =>
      apiClient.get<Page<PromptSummary>>(
        q
          ? `/api/prompts?q=${encodeURIComponent(q)}&page=${pageParam}`
          : `/api/prompts?page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  })
  const prompts = data?.pages.flatMap((page) => page.items)

  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="button-link button-link-sm"
          onClick={() => createPrompt.mutate()}
          disabled={createPrompt.isPending}
        >
          {createPrompt.isPending ? 'Creating…' : 'New Prompt'}
        </button>
      </div>
      {createPrompt.isError && (
        <ErrorAlert>{errorMessage(createPrompt.error)}</ErrorAlert>
      )}
      {isPending && <Loading />}
      {isError && <LoadError>Could not load prompts.</LoadError>}
      {prompts && prompts.length === 0 && (
        <EmptyState>
          {q ? 'No matches for this search.' : 'No prompts yet.'}
        </EmptyState>
      )}
      {prompts && prompts.length > 0 && (
        <ul className="prompt-grid">
          {prompts.map((prompt) => (
            <li
              key={prompt.promptId}
              className="prompt-card"
              role="button"
              tabIndex={0}
              aria-label={`View ${prompt.name}`}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button')) return
                navigate(`/prompts/${prompt.promptId}/console`)
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/prompts/${prompt.promptId}/console`)
                }
              }}
            >
              <Link to={`/prompts/${prompt.promptId}/console`}>
                {prompt.name}
              </Link>
              {prompt.description && (
                <p className="prompt-card-description">{prompt.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <LoadMoreButton
        hasMore={hasNextPage}
        isLoading={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />
    </>
  )
}
