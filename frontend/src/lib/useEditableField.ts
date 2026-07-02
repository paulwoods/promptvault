import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from './apiClient'

interface UseEditableFieldOptions {
  queryKey: QueryKey
  endpoint: string
  field: string
}

export function useEditableField({
  queryKey,
  endpoint,
  field,
}: UseEditableFieldOptions) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: () => apiClient.put(endpoint, { [field]: value }),
    onSuccess: () => {
      setValue('')
      setEditing(false)
      return queryClient.invalidateQueries({ queryKey })
    },
  })

  return { value, setValue, editing, setEditing, save }
}
