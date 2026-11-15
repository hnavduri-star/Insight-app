import React from 'react';
import ReactDOM from 'react-dom/client';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth';
import { Spinner } from './components/ui';
import { BottomNav } from './components/BottomNav';
import { ForgotPassword, Login, ResetPassword, Signup, VerifyEmail } from './pages/AuthPages';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Profile from './pages/Profile';
import People from './pages/People';

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
  if (!me) return <Navigate to="/login" replace />;
  if (needsOnboarding && !me.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function WithNav() { return <><Outlet /><BottomNav /></>; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Public />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route element={<Private needsOnboarding={false} />}>
            <Route path="/onboarding" element={<Onboarding />} />
          </Route>
          <Route element={<Private />}>
            <Route element={<WithNav />}>
              <Route path="/" element={<Home />} />
              <Route path="/people" element={<People />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
