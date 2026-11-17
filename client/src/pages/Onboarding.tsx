import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, browserTimezone, type Me } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';
import { CoachBubble } from '../components/Coach';
import { CoachPicker, GoalPicker, IndustryPicker, MinutesPicker, PersonaPicker } from '../components/Pickers';
import { COACHES } from '../options';

export default function Onboarding() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    persona: me?.persona ?? null, industry: me?.industry ?? null, goals: me?.goals ?? [],
    dailyMinutes: me?.dailyMinutes ?? null, coach: me?.coach ?? null,
  });
  const [start, setStart] = useState<'choose' | 'guide' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const steps = [
    { title: "Let's shape your learning journey", ok: !!f.persona && !!f.industry },
    { title: 'What are you working towards?', ok: f.goals.length > 0 && !!f.dailyMinutes },
    { title: 'Meet your coach', ok: !!f.coach },
    { title: 'How would you like to begin?', ok: !!start },
  ];
  const cur = steps[step];

  const next = async () => {
    if (step < steps.length - 1) return setStep(step + 1);
    setBusy(true); setError('');
    try {
      setMe(await api<Me>('/me/onboarding', { body: { ...f, timezone: browserTimezone() } }));
      // Choose topics yourself (Explore), or let the coach guide with a few questions (Find my skills).
      nav(start === 'guide' ? '/finder?welcome=1' : '/explore', { replace: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const coachName = COACHES.find((c) => c.value === f.coach)?.name;

  return (
    <main className="page flex min-h-dvh flex-col pb-8">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-muted">
          <span>Step {step + 1} of {steps.length}</span>
          <span>Hi {me?.name.split(' ')[0]}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-accent"
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
      </div>

      <h1 className="mb-6 text-[26px] font-semibold leading-tight">{cur.title}</h1>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}
          className="flex-1 space-y-6">
          {step === 0 && <>
            <PersonaPicker value={f.persona} onChange={(persona) => setF({ ...f, persona })} />
            <IndustryPicker value={f.industry} onChange={(industry) => setF({ ...f, industry })} />
          </>}
          {step === 1 && <>
            <GoalPicker value={f.goals} onChange={(goals) => setF({ ...f, goals })} />
            <MinutesPicker value={f.dailyMinutes} onChange={(dailyMinutes) => setF({ ...f, dailyMinutes })} />
          </>}
          {step === 2 && <>
            <CoachPicker value={f.coach} onChange={(coach) => setF({ ...f, coach })} />
            {f.coach && (
              <CoachBubble coach={f.coach}>
                Hi, I'm {coachName}! I'll guide you through every bite and help you put it to work. You can switch coaches any time in your Profile.
              </CoachBubble>
            )}
          </>}
          {step === 3 && (
            <div className="space-y-3" role="radiogroup" aria-label="How to begin">
              {([
                ['choose', 'I know what I want', 'Browse the skills and pick your own topics.', '🧭'],
                ['guide', `Guide me, ${coachName ?? 'coach'}`, 'Answer about 10 quick questions about your work, and I’ll recommend where to start.', '✨'],
              ] as const).map(([v, t, d, icon]) => (
                <button key={v} role="radio" aria-checked={start === v} onClick={() => setStart(v)}
                  className={`flex w-full items-start gap-3 rounded-[22px] p-4 text-left transition ${start === v ? 'bg-accent/15 ring-2 ring-accent' : 'bg-white/[0.06]'}`}>
                  <span className="text-2xl" aria-hidden>{icon}</span>
                  <span><span className="block text-[17px] font-bold">{t}</span><span className="mt-0.5 block text-sm text-muted">{d}</span></span>
                </button>
              ))}
              <p className="px-1 text-xs text-muted">You can do either any time from Explore.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 space-y-3">
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary" disabled={!cur.ok || busy} onClick={next}>
          {step < steps.length - 1 ? 'Continue' : busy ? 'Saving…' : 'Start learning'}
        </button>
        {step > 0 && <button className="btn-ghost w-full" onClick={() => setStep(step - 1)}>Back</button>}
      </div>
    </main>
  );
}
