import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand/brand-mark';

const YEAR = new Date().getFullYear();

interface AuthLayoutProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

/**
 * Split screen on wide viewports: a quiet ink panel stating how sessions work, and the form.
 * On phones the panel collapses to the brand mark above the form.
 */
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex">
        <BrandMark />
        <div className="max-w-md">
          <p className="text-[clamp(2.5rem,4vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.03em]">
            Sign in once.
            <br />
            Stay signed in for a&nbsp;week.
          </p>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-paper/70">
            Your session renews quietly in the background and ends the moment you sign out.
            Passwords are hashed with scrypt and never stored.
          </p>
        </div>
        <p className="text-sm text-paper/50">© {YEAR} Atrium</p>
        <DoorwayPattern />
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <BrandMark className="text-ink lg:hidden dark:text-paper" />
        <div className="flex flex-1 justify-center pt-10 pb-6 lg:items-center lg:py-10">
          <div className="w-full max-w-[25rem]">
            <h1 className="text-3xl font-extrabold tracking-[-0.02em]">{title}</h1>
            <p className="mt-2 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Faint arches in the panel corner, echoing the logo's doorway. */
function DoorwayPattern() {
  return (
    <svg
      className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] text-paper/[0.06]"
      viewBox="0 0 200 200"
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const inset = i * 18;
        return (
          <path
            key={i}
            d={`M${20 + inset} 200V${100 + inset * 0.2}a${80 - inset} ${80 - inset} 0 0 1 ${160 - inset * 2} 0V200`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}
