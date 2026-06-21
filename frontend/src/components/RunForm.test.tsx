import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RunForm } from './RunForm'

describe('RunForm', () => {
  it('pre-fills inputs from declared defaults', () => {
    render(
      <RunForm
        variables={[{ name: 'topic', required: true, defaultValue: 'AI' }]}
        onRun={() => {}}
      />,
    )

    expect(screen.getByLabelText('topic')).toHaveValue('AI')
  })

  it('blocks the run when a required value is empty', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <RunForm
        variables={[{ name: 'topic', required: true, defaultValue: null }]}
        onRun={onRun}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onRun).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('topic')
  })

  it('runs with the supplied values when required fields are filled', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <RunForm
        variables={[{ name: 'topic', required: true, defaultValue: null }]}
        onRun={onRun}
      />,
    )

    await user.type(screen.getByLabelText('topic'), 'rivers')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onRun).toHaveBeenCalledWith({ topic: 'rivers' })
  })

  it('allows an empty optional value', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <RunForm
        variables={[{ name: 'note', required: false, defaultValue: null }]}
        onRun={onRun}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onRun).toHaveBeenCalledWith({ note: '' })
  })
})
