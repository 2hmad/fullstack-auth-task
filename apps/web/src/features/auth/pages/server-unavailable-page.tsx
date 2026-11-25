import { Button } from '@/components/ui/button';
import { useSession } from '../use-session';

/** The session could not be checked, so the visitor may well be signed in: offer a retry, not sign-in. */
export function ServerUnavailablePage() {
  const { retry, isRetrying } = useSession();
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div role="alert">
        <h1 className="text-3xl font-extrabold tracking-tight">We can’t reach the server</h1>
        <p className="mt-2 text-muted-foreground">
          Your session could not be checked. Check your connection and try again.
        </p>
        <Button onClick={retry} disabled={isRetrying} size="lg" className="mt-6 h-11 px-5">
          {isRetrying ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    </main>
  );
}
