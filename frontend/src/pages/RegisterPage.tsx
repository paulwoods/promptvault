import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => apiClient.post('/api/auth/register', { email, password }),
    onSuccess: () => navigate('/login', { replace: true }),
  })

  return (
    <main>
      <h1>Create account</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={mutation.isPending}>
          Create account
        </button>
      </form>
      {mutation.isError && <p role="alert">{errorMessage(mutation.error)}</p>}
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  )
}
