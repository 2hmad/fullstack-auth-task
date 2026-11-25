import { LoaderCircle, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { FormError } from '@/features/auth/components/form-error';
import { SIGN_IN_PATH } from '@/features/auth/guards/route-guards';
import { useSession } from '@/features/auth/use-session';

const memberSince = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export function WelcomePage() {
  const { user, signOut, isSigningOut } = useSession();
  const navigate = useNavigate();

  const [signOutError, setSignOutError] = useState<string>();

  const handleSignOut = async () => {
    setSignOutError(undefined);
    try {
      await signOut();
      navigate(SIGN_IN_PATH, { replace: true });
    } catch {
      // The session is still alive on the server: say so instead of pretending.
      setSignOutError('Could not sign you out. Check your connection and try again.');
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
          <BrandMark />
          <Button
            variant="ghost"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="h-9 text-paper hover:bg-paper/10 hover:text-paper"
          >
            {isSigningOut ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <LogOut aria-hidden />
            )}
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-8 sm:py-24">
        {signOutError && (
          <div className="mb-10 max-w-xl">
            <FormError message={signOutError} />
          </div>
        )}
        <h1 className="max-w-[14ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.98] font-extrabold tracking-[-0.035em]">
          Welcome to the application.
        </h1>
        {user && (
          <dl className="mt-12 grid max-w-2xl gap-6 border-t pt-8 sm:grid-cols-[1fr_1.6fr_1fr]">
            <div>
              <dt className="text-sm text-muted-foreground">Signed in as</dt>
              <dd className="mt-1 font-semibold">{user.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="mt-1 font-semibold [overflow-wrap:anywhere]">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Member since</dt>
              <dd className="mt-1 font-semibold">{memberSince.format(new Date(user.createdAt))}</dd>
            </div>
          </dl>
        )}
      </main>
    </div>
  );
}
