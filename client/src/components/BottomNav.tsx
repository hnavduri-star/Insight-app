import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /> },
  { to: '/people', label: 'People', icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.2c3 .2 5 2.3 5 5.3" /></> },
  { to: '/profile', label: 'Profile', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></> },
];

export function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'rgba(8, 21, 52, 0.88)', borderTop: '1px solid rgba(157,179,220,0.10)' }}>
      <ul className="mx-auto flex max-w-app">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end
              className={({ isActive }) => `flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-medium transition ${isActive ? 'text-primary' : 'text-muted/80 hover:text-ink'}`}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{i.icon}</svg>
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
