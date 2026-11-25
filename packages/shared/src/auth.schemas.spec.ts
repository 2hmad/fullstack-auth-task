import {
  PASSWORD_RULES,
  emailSchema,
  nameSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
} from './auth.schemas.js';

const messagesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('emailSchema', () => {
  it.each(['user@example.com', 'first.last+tag@sub.example.co'])('accepts %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(true);
  });

  it.each(['', 'plainaddress', 'user@', '@example.com', 'user@example', 'a b@example.com'])(
    'rejects %j',
    (email) => {
      expect(emailSchema.safeParse(email).success).toBe(false);
    },
  );

  it('trims and lower-cases so the same mailbox cannot register twice', () => {
    expect(emailSchema.parse('  User@Example.COM ')).toBe('user@example.com');
  });

  it('rejects addresses longer than 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
    expect(email).toHaveLength(255);
    expect(emailSchema.safeParse(email).success).toBe(false);
  });
});

describe('nameSchema', () => {
  it('accepts a name of exactly 3 characters', () => {
    expect(nameSchema.parse('Ada')).toBe('Ada');
  });

  it('rejects names shorter than 3 characters', () => {
    expect(messagesOf(nameSchema.safeParse('Al'))).toEqual(['Name must be at least 3 characters']);
  });

  it('does not count surrounding whitespace towards the minimum', () => {
    expect(nameSchema.safeParse('  Al  ').success).toBe(false);
    expect(nameSchema.parse('  Ada  ')).toBe('Ada');
  });

  it('rejects names longer than 50 characters', () => {
    expect(nameSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });

  it('accepts non-latin names', () => {
    expect(nameSchema.safeParse('Zoë Ñúñez').success).toBe(true);
  });
});

describe('passwordSchema', () => {
  it.each(['abcdef1!', 'Sup3r$ecret', 'pässwörd1#'])('accepts %j', (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(true);
  });

  it.each([
    ['too short', 'ab1!', 'Password must be at least 8 characters'],
    ['no letter', '12345678!', 'Password must contain at least one letter'],
    ['no number', 'abcdefgh!', 'Password must contain at least one number'],
    ['no special character', 'abcdefgh1', 'Password must contain at least one special character'],
  ])('rejects a password with %s', (_case, password, message) => {
    expect(messagesOf(passwordSchema.safeParse(password))).toContain(message);
  });

  it('does not count whitespace as a special character', () => {
    expect(passwordSchema.safeParse('abcd 1234').success).toBe(false);
  });

  it('reports every unmet rule at once', () => {
    expect(messagesOf(passwordSchema.safeParse('abc'))).toHaveLength(3);
  });

  it('caps the length at 128 to bound hashing cost', () => {
    expect(passwordSchema.safeParse(`a1!${'x'.repeat(126)}`).success).toBe(false);
  });
});

describe('PASSWORD_RULES', () => {
  it('drives the same checks the schema enforces', () => {
    const password = 'abcdefgh';
    const failing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id);
    expect(failing).toEqual(['number', 'special']);
  });
});

describe('signUpSchema', () => {
  const valid = { email: 'ada@example.com', name: 'Ada Lovelace', password: 'Analytical1!' };

  it('accepts a valid payload', () => {
    expect(signUpSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown keys so clients cannot smuggle fields like "role"', () => {
    expect(signUpSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
  });

  it('requires every field', () => {
    const result = signUpSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['email', 'name', 'password']);
  });
});

describe('signInSchema', () => {
  it('does not apply strength rules, so passwords set under older rules still sign in', () => {
    expect(signInSchema.safeParse({ email: 'ada@example.com', password: 'weak' }).success).toBe(true);
  });

  it('requires a non-empty password', () => {
    expect(signInSchema.safeParse({ email: 'ada@example.com', password: '' }).success).toBe(false);
  });
});
