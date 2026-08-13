import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

// jsdom under Node does not reliably expose localStorage; provide an in-memory one.
const store = new Map<string, string>()
const localStorageMock = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string) => {
    store.delete(key)
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
}
vi.stubGlobal('localStorage', localStorageMock)

// CodeMirror (under the markdown editor) measures text by putting a Range
// around it. jsdom leaves the measuring half of Range unimplemented, so these
// stand in with an empty box — enough for the editor to build without throwing.
// Nothing here is asserted on: layout is not what jsdom is for.
const emptyRect = {
  x: 0,
  y: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} as DOMRect
Range.prototype.getBoundingClientRect = () => emptyRect
Range.prototype.getClientRects = () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => server.close())
