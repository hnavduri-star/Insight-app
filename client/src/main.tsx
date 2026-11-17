import React from 'react';
import ReactDOM from 'react-dom/client';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast';
import { api, type Me } from './api';
import './index.css';
import { AuthProvider, useAuth } from './auth';
import { Spinner } from './components/ui';
import { BottomNav } from './components/BottomNav';
import { ForgotPassword, Login, ResetPassword, Signup, VerifyEmail } from './pages/AuthPages';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Profile from './pages/Profile';
import People from './pages/People';
import Skills from './pages/Skills';
import Bite from './pages/Bite';
import Practice from './pages/Practice';
import { NewSituation, SituationPlan } from './pages/Situation';
import RolePlay from './pages/RolePlay';
import Tools from './pages/Tools';
import Progress from './pages/Progress';
import TeamDashboard from './pages/Team';
import Admin from './pages/Admin';
import Friends from './pages/Friends';
import Finder from './pages/Finder';
import CpdLog, { Certificate, Verify } from './pages/Cpd';
import Daily, { Week } from './pages/Daily';
import Welcome from './pages/Welcome';
import Coaching, { CoachingSession } from './pages/Coaching';
import Explore from './pages/Explore';

/** Signed-out only. */
function Public() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  return me ? <Navigate to={me.onboarded ? '/' : '/onboarding'} replace /> : <Outlet />;
}

/** Signed in; new users are sent to onboarding first. */
function Private({ needsOnboarding = true }: { needsOnboarding?: boolean }) {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/welcome" replace />;
  if (needsOnboarding && !me.onboarded) return <Navigate to="/onboarding" replace />;
  return <><ActiveTime /><Outlet /></>;
}

/**
 * Time spent learning (the weekly league): every 30 seconds while the app is open and visible and the learner
 * has touched it in the last 90 seconds. Idle or background time doesn't count.
 */
function ActiveTime() {
  useEffect(() => {
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last < 90_000) api('/friends/time', { body: { seconds: 30 } }).catch(() => {});
    }, 30_000);
    return () => { clearInterval(timer); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, []);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** Handles the return from Stripe Checkout (?checkout=success&session_id=… or ?checkout=cancelled). */
function CheckoutReturn() {
  const { search } = useLocation();
  const nav = useNavigate();
  const { me, setMe } = useAuth();
  const toast = useToast();
  useEffect(() => {
    const q = new URLSearchParams(search);
    const result = q.get('checkout');
    if (!result || !me) return;
    nav('/', { replace: true });
    if (result === 'cancelled') { toast('Checkout cancelled. You can upgrade any time.'); return; }
    const sessionId = q.get('session_id');
    if (!sessionId) return;
    api<Me>('/billing/confirm', { body: { sessionId } })
      .then((m) => { setMe(m); toast(m.plan === 'premium' ? 'Welcome to Insight Premium. Every topic is now open.' : 'Payment received. Premium will switch on in a moment.', 'success'); })
      .catch(() => toast('Payment received. Premium will switch on in a moment.', 'success'));
  }, [search, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function WithNav() { return <><CheckoutReturn /><Outlet /><BottomNav /></>; }

// A friend invite link (/friends?add=CODE) survives sign-up: keep the code until the league page uses it.
try {
  const invite = new URLSearchParams(window.location.search).get('add');
  if (window.location.pathname === '/friends' && invite) localStorage.setItem('insight.invite', invite);
} catch { /* storage blocked */ }

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Public />}>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify/:code" element={<Verify />} />
          <Route element={<Private needsOnboarding={false} />}>
            <Route path="/onboarding" element={<Onboarding />} />
          </Route>
          <Route element={<Private />}>
            <Route path="/bite/:topicId" element={<Bite />} />
            <Route path="/practice/:topicId" element={<Practice />} />
            <Route path="/roleplay/:topicId" element={<RolePlay />} />
            <Route path="/daily" element={<Daily />} />
            <Route path="/tools/:topicId" element={<Tools />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/team" element={<TeamDashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/finder" element={<Finder />} />
            <Route path="/cpd" element={<CpdLog />} />
            <Route path="/coach/session/:id" element={<CoachingSession />} />
            <Route path="/certificate/:id" element={<Certificate />} />
            <Route path="/week" element={<Week />} />
            <Route path="/situation" element={<NewSituation />} />
            <Route path="/situation/:id" element={<SituationPlan />} />
            <Route element={<WithNav />}>
              <Route path="/skills/:id" element={<Skills />} />
              <Route path="/" element={<Home />} />
              <Route path="/coach" element={<Coaching />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/mind" element={<NewSituation asTab />} />
              <Route path="/people" element={<People />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);
