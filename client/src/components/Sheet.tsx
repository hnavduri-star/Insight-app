import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  // Swipe-to-close starts only from the handle, so the rest of the sheet scrolls normally on phones.
  const drag = useDragControls();
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
            className="relative max-h-[88dvh] w-full max-w-app overflow-y-auto overscroll-contain rounded-t-[24px] px-5 pt-3"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(232,240,255,0.04), rgba(232,240,255,0) 30%), #10275a', borderTop: '1px solid rgba(157,179,220,0.16)', boxShadow: '0 -20px 50px -20px rgba(0,0,0,0.7)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }}>
            <div className="-mx-5 -mt-3 mb-2 flex cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)} aria-hidden>
              <div className="h-1.5 w-10 rounded-full bg-muted/30" />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
