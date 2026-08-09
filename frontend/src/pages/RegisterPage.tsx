import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthHero } from '../components/AuthHero'
import { ErrorAlert } from '../components/ErrorAlert'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'

export function RegisterPage() {
  usePageTitle('Create account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => apiClient.post('/api/auth/register', { email, password }),
    onSuccess: () => navigate('/login', { replace: true }),
  })

  return (
    <div className="auth-page">
      <AuthHero
        title="Create your account"
        subtitle="Store and run your Claude prompts."
      />
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
      {mutation.isError && (
        <ErrorAlert>{errorMessage(mutation.error)}</ErrorAlert>
      )}
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}
