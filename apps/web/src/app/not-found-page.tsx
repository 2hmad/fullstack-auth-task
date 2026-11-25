import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">This page doesn’t exist</h1>
        <p className="mt-2 text-muted-foreground">Check the address, or go back to the start.</p>
        <Link to="/" className="mt-6 inline-block font-semibold underline underline-offset-4">
          Go to the start
        </Link>
      </div>
    </main>
  );
}
