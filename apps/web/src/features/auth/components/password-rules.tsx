import { PASSWORD_RULES } from '@auth-app/shared';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Live checklist driven by the same PASSWORD_RULES the API enforces: four segments fill as
 * each rule is met, so the requirements are visible before the first error, not after.
 */
export function PasswordRules({ password }: { password: string }) {
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(password) }));
  const metCount = results.filter((rule) => rule.met).length;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {results.map((rule) => (
          <span
            key={rule.id}
            className={cn(
              'h-1.5 rounded-full transition-colors duration-300',
              rule.met ? 'bg-success' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {results.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              rule.met ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                rule.met ? 'border-success bg-success' : 'border-input',
              )}
              aria-hidden
            >
              {rule.met && <Check className="size-3 text-white" strokeWidth={3} />}
            </span>
            {rule.label}
            <span className="sr-only">{rule.met ? '(done)' : '(missing)'}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {metCount} of {results.length} password requirements met
      </p>
    </div>
  );
}
