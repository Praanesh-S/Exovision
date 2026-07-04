import { Link, useLocation } from 'react-router-dom'

/**
 * Top navigation bar — premium glass morphism style.
 * Shows the Exovision brand, navigation links, and online status.
 */
export default function NavBar() {
  const location = useLocation()

  const links = [
    { to: '/', label: 'Home' },
    { to: '/classify', label: 'Classify' },
    { to: '/about', label: 'About' },
  ]

  return (
    <nav className="glass sticky top-0 z-50 border-b border-border h-14 px-6 flex items-center justify-between">
      {/* Brand */}
      <Link
        to="/"
        className="flex items-center gap-2.5 text-lg font-semibold tracking-tight no-underline"
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full bg-aurora glow-accent animate-pulse"
          aria-hidden="true"
        />
        <span className="font-display text-text-primary">
          Exo<span className="text-aurora-bright">vision</span>
        </span>
      </Link>

      {/* Center — Nav links */}
      <div className="flex items-center gap-6">
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`text-sm font-medium transition-colors duration-200 no-underline ${
              location.pathname === to
                ? 'text-aurora-bright'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right — Status badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface/40 text-xs text-text-secondary">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-habitable opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-habitable" />
        </span>
        Online
      </div>
    </nav>
  )
}
