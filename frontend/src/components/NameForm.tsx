import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { useMe } from '../lib/useMe'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'

export function NameForm() {
  const queryClient = useQueryClient()
  const me = useMe()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: () => apiClient.put('/api/me/name', { name }),
    onSuccess: () => {
      setName('')
      setEditing(false)
      return queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  if (me.isPending) return <Loading />

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <label>
          Display name
          <div className="api-key-row">
            <input
              type="text"
              name="name"
              value={editing ? name : (me.data?.name ?? '')}
              readOnly={!editing}
              onFocus={() => {
                if (!editing) {
                  setName(me.data?.name ?? '')
                  setEditing(true)
                }
              }}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <button
              type="submit"
              className="button-sm"
              disabled={save.isPending}
            >
              Save Name
            </button>
          </div>
        </label>
      </form>
      {save.isError && <ErrorAlert>{errorMessage(save.error)}</ErrorAlert>}
    </>
  )
}
