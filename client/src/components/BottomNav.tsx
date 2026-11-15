import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /> },
  { to: '/profile', label: 'Profile', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></> },
];

export function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto flex max-w-app">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end
              className={({ isActive }) => `flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-medium transition ${isActive ? 'text-primary' : 'text-muted hover:text-ink'}`}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{i.icon}</svg>
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
