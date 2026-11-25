import { cn } from '@/lib/utils';

/** Logo: an open doorway. The product is the way in. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2.5 font-extrabold tracking-tight', className)}
    >
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="3" y="2" width="18" height="20" rx="2.5" fill="currentColor" />
        <path d="M9 22V9.5a3 3 0 0 1 6 0V22" fill="var(--saffron)" />
      </svg>
      <span className="text-lg">Atrium</span>
    </span>
  );
}
