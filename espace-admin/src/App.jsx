/**
 * App.jsx — added ProtectedRoute component that reads isAuthenticated from
 * the Zustand auth store and redirects unauthenticated users to /login.
 * All dashboard routes are now wrapped with <ProtectedRoute>.
 */
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import UserKycPreview from './pages/UserKycPreview'
import DealsEscrow from './pages/DealsEscrow'
import ContentModeration from './pages/ContentModeration'
import ShipmentPosts from './pages/ShipmentPosts'
import TripPosts from './pages/TripPosts'
import GeneratedReports from './pages/GeneratedReports'
import Analytics from './pages/Analytics'
import Disputes from './pages/Disputes'
import AdminTasks from './pages/AdminTasks'
import AuditLog from './pages/AuditLog'
import PricingDataManager from './pages/PricingDataManager'
import TransactionHistory from './pages/TransactionHistory'
import { useAuthStore } from './store/authStore'

// Guards all child routes — redirects to /login if not authenticated
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true,              element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',        element: <Dashboard /> },
      { path: 'users',            element: <UserManagement /> },
      { path: 'users/:id/kyc',    element: <UserKycPreview /> },
      { path: 'transactions',     element: <DealsEscrow /> },
      { path: 'deals',            element: <Navigate to="/transactions" replace /> },
      { path: 'shipments',        element: <ShipmentPosts /> },
      { path: 'trips',            element: <TripPosts /> },
      { path: 'moderation',       element: <ContentModeration /> },
      { path: 'content-moderation', element: <Navigate to="/moderation" replace /> },
      { path: 'reports',          element: <GeneratedReports /> },
      { path: 'analytics',        element: <Analytics /> },
      { path: 'disputes',         element: <Disputes /> },
      { path: 'admin-tasks',      element: <AdminTasks /> },
      { path: 'audit',            element: <AuditLog /> },
      { path: 'pricing',          element: <PricingDataManager /> },
      { path: 'transaction-history', element: <TransactionHistory /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
