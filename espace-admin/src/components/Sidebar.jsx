import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, MapPin, CreditCard, Users,
  BarChart2, ShieldCheck, FileText, HelpCircle, MessageSquare, LogOut, Zap,
  Gavel, ClipboardList, FileSearch, TrendingUp, History,
} from 'lucide-react'

const SECTIONS = [
  {
    label: null,
    items: [{ path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Operations',
    items: [
      { path: '/shipments',        icon: Package,   label: 'Shipments' },
      { path: '/trips',            icon: MapPin,    label: 'Trip Posts' },
      { path: '/transactions',     icon: CreditCard, label: 'Escrow & Deals' },
    ],
  },
  {
    label: 'Users',
    items: [{ path: '/users', icon: Users, label: 'User Management' }],
  },
  {
    label: 'Intelligence',
    items: [
      { path: '/analytics',   icon: BarChart2,   label: 'Analytics' },
      { path: '/moderation',  icon: ShieldCheck, label: 'Risk Assessment' },
    ],
  },
  {
    label: 'Admin Tools',
    items: [
      { path: '/disputes',     icon: Gavel,          label: 'Disputes' },
      { path: '/admin-tasks',  icon: ClipboardList,   label: 'Admin Tasks' },
      { path: '/audit',        icon: FileSearch,      label: 'Audit Log' },
      { path: '/pricing',      icon: TrendingUp,      label: 'Pricing Data' },
      { path: '/transaction-history', icon: History,   label: 'Transaction History' },
    ],
  },
  {
    label: 'System',
    items: [{ path: '/reports', icon: FileText, label: 'Reports' }],
  },
]

export default function Sidebar() {
  const navigate = useNavigate()

  return (
    <aside className="w-60 fixed left-0 top-0 h-screen bg-surface-container-low flex flex-col z-50 border-r border-outline-variant/20">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 monolith-gradient rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-[17px] font-black tracking-tight text-primary leading-none">Bridger</div>
            <div className="text-[9px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant mt-0.5">Intelligent Monolith</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto scrollbar-hidden space-y-4 pb-4">
        {SECTIONS.map(({ label, items }) => (
          <div key={label ?? 'main'}>
            {label && (
              <p className="px-3 mb-1 text-[9px] font-bold tracking-[0.18em] uppercase text-on-surface-variant/60">
                {label}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(({ path, icon: Icon, label: itemLabel }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[12px] font-medium
                    ${isActive
                      ? 'border-l-[3px] border-primary text-primary bg-primary/8 pl-[9px] font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {itemLabel}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 pt-3 border-t border-outline-variant/20 space-y-0.5">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
          <HelpCircle className="w-4 h-4" /> Help Center
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all">
          <MessageSquare className="w-4 h-4" /> Support
        </button>
        <button
          onClick={() => navigate('/login')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-medium text-on-surface-variant hover:text-error hover:bg-error-container/50 transition-all"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>

        {/* Admin profile */}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 bg-surface-container rounded-lg">
          <div className="w-8 h-8 rounded-full monolith-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            SA
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-on-surface truncate">Super Admin</div>
            <div className="text-[10px] text-on-surface-variant">SUPER_ADMIN</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
