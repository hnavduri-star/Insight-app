import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /> },
  { to: '/explore', label: 'Explore', icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></> },
  { to: '/mind', label: 'On my mind', icon: <><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z" /><path d="M10 22h4" /></> },
  { to: '/coach', label: 'Coach', icon: <><path d="M4 5h16v10H9l-5 4V5Z" /><path d="M9 9.5h6M9 12h3.5" /></> },
  { to: '/profile', label: 'Me', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></> },
];

export function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 px-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <ul className="mx-auto flex max-w-[440px] rounded-[26px] border border-white/10 p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
        style={{ background: 'rgba(13, 26, 70, 0.82)' }}>
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end
              className={({ isActive }) => `flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-0.5 text-center text-[10.5px] font-bold leading-tight transition ${isActive ? 'bg-white text-[#1e3a8a]' : 'text-muted hover:text-ink'}`}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{i.icon}</svg>
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
