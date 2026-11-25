import { signInSchema, type SignInInput, type SignInPayload } from '@auth-app/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '../components/auth-layout';
import { FormError } from '../components/form-error';
import { FormField } from '../components/form-field';
import { PasswordInput } from '../components/password-input';
import { SubmitButton } from '../components/submit-button';
import { APP_PATH } from '../guards/route-guards';
import { describeAuthError } from '../server-errors';
import { useSession } from '../use-session';

export function SignInPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string>();

  const form = useForm<SignInInput, unknown, SignInPayload>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await signIn(values);
      // Back to the page that sent them here, if any.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? APP_PATH, { replace: true });
    } catch (error) {
      setFormError(describeAuthError(error, 'Could not sign you in. Try again.'));
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      description={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormError message={formError} />

        <FormField label="Email" error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              className="h-11"
            />
          )}
        </FormField>

        <FormField label="Password" error={errors.password?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              {...form.register('password')}
              autoComplete="current-password"
            />
          )}
        </FormField>

        <SubmitButton pending={isSubmitting} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
