import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '../components/ui';

const STORY = [
  { big: 'The best books.', rest: 'Turned into practical tools you can use tomorrow, not summaries you forget by Friday.', tint: '#5ec2ff' },
  { big: 'Practise for real.', rest: 'Rehearse the tough conversation with your boss, your client or your team before it happens.', tint: '#ffb36b' },
  { big: 'A coach in your pocket.', rest: 'Someone who asks the right questions, so you find your own answers and own your growth.', tint: '#3ee6cf' },
  { big: 'CPD that counts.', rest: 'One-hour modules with certificates your employer can verify.', tint: '#c4b5fd' },
];

/** The first screen: what Insight is, in big words, and one way in. */
export default function Welcome() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-app overflow-hidden px-5" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#7c3aed]/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-24 top-64 h-72 w-72 rounded-full bg-[#0ea5e9]/30 blur-3xl" aria-hidden />

      <header className="relative flex items-center gap-2.5">
        <Logo size={36} />
        <span className="font-display text-xl font-extrabold tracking-tight">Insight</span>
      </header>

      <section className="relative pt-12">
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-[clamp(3rem,15vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">
          Grow into who you’re working to be.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="mt-6 text-[clamp(1.25rem,5.5vw,1.6rem)] font-semibold leading-snug text-ink/85">
          Insight is your personal development coach for work and life.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-8 flex flex-wrap gap-x-4 gap-y-1">
          {['Learn it.', 'Practise it.', 'Live it.'].map((w, i) => (
            <span key={w} className="text-[clamp(1.9rem,9vw,2.6rem)] font-extrabold tracking-tight"
              style={{ color: ['#5ec2ff', '#ffb36b', '#3ee6cf'][i] }}>{w}</span>
          ))}
        </motion.div>
      </section>

      <section className="relative mt-14 space-y-12 pb-40">
        {STORY.map((s, i) => (
          <motion.div key={s.big} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.45, delay: i * 0.04 }}>
            <p className="text-[clamp(2.2rem,11vw,3.2rem)] font-extrabold leading-[1] tracking-[-0.03em]" style={{ color: s.tint }}>{s.big}</p>
            <p className="mt-3 text-[clamp(1.1rem,4.8vw,1.35rem)] leading-snug text-ink/80">{s.rest}</p>
          </motion.div>
        ))}
        <p className="text-[clamp(1.6rem,7.5vw,2.2rem)] font-extrabold leading-tight tracking-tight">
          For early-career professionals, managers and senior leaders.
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-app px-5 pt-10"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))', background: 'linear-gradient(to bottom, rgba(10,26,63,0) 0%, #0a1a3f 45%)' }}>
        <Link to="/login" className="btn-primary flex min-h-[60px] items-center justify-center text-lg">Log in or register</Link>
      </div>
    </main>
  );
}
