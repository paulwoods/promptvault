import { Outlet } from 'react-router'
import { TopNav } from './TopNav'

/**
 * App shell: sticky top nav + a centered <main>. Every route renders inside
 * <main> via the outlet, so loading/error early-returns inherit centering and
 * padding instead of rendering flush under the nav.
 */
export function Layout() {
  return (
    <>
      <TopNav />
      <main>
        <Outlet />
      </main>
    </>
  )
}
