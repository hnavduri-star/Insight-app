import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center">
          <motion.button aria-label="Close" className="absolute inset-0 bg-[#030a1f]/70 backdrop-blur-[2px]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className="relative max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-t-[24px] px-5 pt-3"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(232,240,255,0.04), rgba(232,240,255,0) 30%), #10275a', borderTop: '1px solid rgba(157,179,220,0.16)', boxShadow: '0 -20px 50px -20px rgba(0,0,0,0.7)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }}>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
