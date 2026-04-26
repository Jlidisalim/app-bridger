import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 ml-60 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto scrollbar-hidden pt-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
