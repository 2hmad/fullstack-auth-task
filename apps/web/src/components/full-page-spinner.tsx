import { LoaderCircle } from 'lucide-react';

export function FullPageSpinner() {
  return (
    <output className="grid min-h-dvh place-items-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Loading</span>
    </output>
  );
}
