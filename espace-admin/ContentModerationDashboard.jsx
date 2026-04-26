import React from "react";

// ─── Circular Progress Ring ───────────────────────────────────────────────────
function CircularProgress({ percentage, color, size = 56 }) {
  const stroke = 5;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: "50% 50%",
          fontSize: size * 0.22,
          fontWeight: 700,
          fill: color,
        }}
      >
        {percentage}%
      </text>
    </svg>
  );
}

// ─── Icons (inline SVG, no external deps) ─────────────────────────────────────
const IconGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const IconBar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconBuilding = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M3 21h18M9 21V7l6-4v18M9 12h6M9 16h6" />
  </svg>
);
const IconDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconQuestion = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconShieldCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-12 h-12">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);
const IconBulb = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-blue-500">
    <line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-400">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Nav Item ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active }) {
  return (
    <li>
      <button
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors
          ${active
            ? "border-l-4 border-blue-600 bg-blue-50 text-blue-700 pl-3"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          }`}
      >
        {icon}
        {label}
      </button>
    </li>
  );
}

// ─── Toxicity Bar ─────────────────────────────────────────────────────────────
function ToxBar({ label, value, barColor }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-500">{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value * 2}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ContentModerationDashboard() {
  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <div className="text-xl font-extrabold text-navy-900" style={{ color: "#0f172a" }}>
            Bridger
          </div>
          <div className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mt-0.5">
            Intelligent Monolith
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2">
          <ul className="space-y-0.5">
            <NavItem icon={<IconGrid />} label="Dashboard" />
            <NavItem icon={<IconBar />} label="Analytics" />
            <NavItem icon={<IconShield />} label="Risk Assessment" active />
            <NavItem icon={<IconBuilding />} label="Portfolio" />
            <NavItem icon={<IconDoc />} label="Reporting" />
          </ul>
        </nav>

        {/* Bottom links */}
        <div className="px-2 py-4 border-t border-gray-100 space-y-0.5">
          <NavItem icon={<IconQuestion />} label="Help Center" />
          <NavItem icon={<IconQuestion />} label="Support" />
        </div>
      </aside>

      {/* ── CENTER COLUMN ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <h1 className="text-xl font-bold text-blue-900" style={{ color: "#1e3a8a" }}>
            Content Moderation
          </h1>
          <div className="flex-1 relative max-w-sm ml-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search reports..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="ml-auto flex items-center gap-3 text-gray-500">
            <button className="p-2 hover:bg-gray-100 rounded-full"><IconBell /></button>
            <button className="p-2 hover:bg-gray-100 rounded-full"><IconGear /></button>
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-sm font-bold">
              A
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Active Reports Queue ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
                Active Reports Queue
              </span>
              <div className="flex gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                  ALL: 142
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                  CRITICAL: 12
                </span>
              </div>
            </div>

            {/* Report Card 1 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                  <IconChat />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-800">Marcus Vane</span>
                    <span className="text-xs text-gray-400">• 2 minutes ago</span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded border border-gray-300 text-gray-500 uppercase tracking-wide">
                      Comment
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-snug">
                    "This platform is absolutely ridiculous. Your support team is incompetent and I hope your servers crash permanently."
                  </p>
                </div>
                <div className="flex flex-col items-center flex-shrink-0 ml-2 gap-1">
                  <CircularProgress percentage={88} color="#ef4444" size={54} />
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded">
                    TOXIC
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500">
                  Reported for:{" "}
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-medium">
                    Harassment
                  </span>
                </span>
                <div className="ml-auto flex gap-2">
                  <button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                    Hide
                  </button>
                  <button className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1">
                    Warn User
                  </button>
                  <button className="text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md font-medium">
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Report Card 2 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
                  <IconMail />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-800">Anonymous Sender</span>
                    <span className="text-xs text-gray-400">• 15 minutes ago</span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded border border-blue-300 text-blue-500 uppercase tracking-wide">
                      Direct Message
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-snug">
                    Check out this crypto link for 1000% returns:{" "}
                    <span className="text-blue-500 underline text-xs">
                      https://bit.ly/scam-link-example-only
                    </span>
                  </p>
                </div>
                <div className="flex flex-col items-center flex-shrink-0 ml-2 gap-1">
                  <CircularProgress percentage={95} color="#f97316" size={54} />
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600 rounded">
                    SPAM
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500">
                  Reported for:{" "}
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-medium">
                    Suspicious Link
                  </span>
                </span>
                <div className="ml-auto flex gap-2">
                  <button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                    Hide
                  </button>
                  <button className="text-xs text-white px-3 py-1 rounded-md font-medium hover:opacity-90"
                    style={{ backgroundColor: "#0f172a" }}>
                    Suspend User
                  </button>
                  <button className="text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md font-medium">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Recent Actions Audit ── */}
          <section>
            <div className="mb-3">
              <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
                Recent Actions Audit
              </span>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Moderator", "Action", "Target", "Time"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-gray-400 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                          SJ
                        </div>
                        <span className="font-medium text-gray-700 text-sm">Sarah J.</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-300 text-red-500 uppercase tracking-wide">
                        Permanent Ban
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">user_9921</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">12m ago</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold">
                          AM
                        </div>
                        <span className="font-medium text-gray-700 text-sm">AutoMod</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded border border-gray-300 text-gray-500 uppercase tracking-wide">
                        Soft Delete
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">comment_442</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">45m ago</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 flex flex-col gap-4 p-4 overflow-y-auto bg-gray-50 border-l border-gray-200">

        {/* Global System Pulse */}
        <div className="rounded-xl p-5 text-white relative overflow-hidden" style={{ backgroundColor: "#1e3a8a" }}>
          <div className="text-[10px] font-semibold tracking-widest uppercase text-blue-200 mb-2">
            Global System Pulse
          </div>
          <div className="flex items-start justify-between">
            <div className="text-5xl font-extrabold leading-none">
              94.2
              <span className="text-2xl font-semibold text-blue-300"> / 100</span>
            </div>
            <div className="text-blue-200 opacity-80">
              <IconShieldCheck />
            </div>
          </div>
          <p className="mt-3 text-xs text-blue-200 leading-relaxed">
            Platform safety index is stable. Automated detection filters are operating at{" "}
            <span className="font-semibold text-white">98.4% precision</span>.
          </p>
          <button className="mt-4 w-full border border-blue-300 text-blue-100 text-xs font-semibold py-2 rounded-lg hover:bg-blue-800 transition-colors tracking-wide uppercase">
            Review Policy Updates
          </button>
        </div>

        {/* Toxicity Breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-4">
            Toxicity Breakdown
          </div>
          <ToxBar label="Hate Speech" value={12.5} barColor="#ef4444" />
          <ToxBar label="Sexual Content" value={4.2} barColor="#7c3aed" />
          <ToxBar label="Insult / Flirting" value={42.8} barColor="#1e3a8a" />
        </div>

        {/* Admin Tip */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 mb-2">
            <IconBulb />
            <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
              Admin Tip
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Use the{" "}
            <kbd className="inline-block px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-700">
              Shift + D
            </kbd>{" "}
            shortcut to quickly delete confirmed violations in the queue.
          </p>
        </div>
      </aside>
    </div>
  );
}
