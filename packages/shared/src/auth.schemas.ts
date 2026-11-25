import { z } from 'zod';

/**
 * Single source of truth for the sign-up / sign-in field rules.
 * The API validates request bodies with these schemas (Nest's StandardSchemaValidationPipe)
 * and the web app validates its forms with the very same objects, so the two cannot drift.
 */

export const EMAIL_MAX_LENGTH = 254; // RFC 5321 path limit
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound keeps a single request from making the server hash megabytes of input. */
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRule {
  readonly id: 'length' | 'letter' | 'number' | 'special';
  /** Short label for a live checklist in the UI. */
  readonly label: string;
  /** Full sentence used as the validation error message. */
  readonly message: string;
  readonly test: (password: string) => boolean;
}

const LETTER = /\p{L}/u;
const NUMBER = /\p{N}/u;
/** Anything that is not a letter, a number or whitespace. */
const SPECIAL = /[^\p{L}\p{N}\s]/u;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'letter',
    label: 'One letter',
    message: 'Password must contain at least one letter',
    test: (password) => LETTER.test(password),
  },
  {
    id: 'number',
    label: 'One number',
    message: 'Password must contain at least one number',
    test: (password) => NUMBER.test(password),
  },
  {
    id: 'special',
    label: 'One special character',
    message: 'Password must contain at least one special character',
    test: (password) => SPECIAL.test(password),
  },
];

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('Enter a valid email address')
      .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters`),
  )
  // pipe() hides the format from JSON Schema, so state it for the OpenAPI document.
  .meta({ format: 'email', maxLength: EMAIL_MAX_LENGTH, examples: ['ada@example.com'] });

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, `Name must be at least ${NAME_MIN_LENGTH} characters`)
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`)
  .meta({ examples: ['Ada Lovelace'] });

export const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .superRefine((password, ctx) => {
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(password)) {
        ctx.addIssue({ code: 'custom', message: rule.message });
      }
    }
  })
  .meta({
    minLength: PASSWORD_MIN_LENGTH,
    description: 'At least one letter, one number and one special character',
    examples: ['Analytical1!'],
  });

export const signUpSchema = z.strictObject({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

/** Sign-in deliberately skips strength rules: they belong to sign-up only. */
export const signInSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Password is required')
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
});

export type SignUpInput = z.input<typeof signUpSchema>;
export type SignUpPayload = z.output<typeof signUpSchema>;
export type SignInInput = z.input<typeof signInSchema>;
export type SignInPayload = z.output<typeof signInSchema>;
