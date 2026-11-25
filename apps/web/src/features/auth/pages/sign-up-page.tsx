import { signUpSchema, type SignUpInput, type SignUpPayload } from '@auth-app/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/api-error';
import { AuthLayout } from '../components/auth-layout';
import { FormError } from '../components/form-error';
import { FormField } from '../components/form-field';
import { PasswordInput } from '../components/password-input';
import { PasswordRules } from '../components/password-rules';
import { SubmitButton } from '../components/submit-button';
import { APP_PATH, SIGN_IN_PATH } from '../guards/route-guards';
import { describeAuthError } from '../server-errors';
import { useSession } from '../use-session';

export function SignUpPage() {
  const { signUp } = useSession();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string>();

  const form = useForm<SignUpInput, unknown, SignUpPayload>({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
    defaultValues: { email: '', name: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await signUp(values);
      navigate(APP_PATH, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setError('email', { message: error.messages[0] }, { shouldFocus: true });
        return;
      }
      setFormError(describeAuthError(error, 'Could not create your account. Try again.'));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      description={
        <>
          Already have one?{' '}
          <Link
            to={SIGN_IN_PATH}
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Sign in
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

        <FormField label="Name" error={errors.name?.message}>
          {(field) => (
            <Input {...field} {...form.register('name')} autoComplete="name" className="h-11" />
          )}
        </FormField>

        <FormField
          label="Password"
          error={errors.password?.message}
          hint={<PasswordRules password={password} />}
        >
          {(field) => (
            <PasswordInput {...field} {...form.register('password')} autoComplete="new-password" />
          )}
        </FormField>

        <SubmitButton pending={isSubmitting} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
