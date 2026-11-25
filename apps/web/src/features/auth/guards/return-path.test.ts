import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('accepts an in-app path', () => {
    expect(safeReturnPath({ from: '/app' })).toBe('/app');
  });

  it.each([
    ['a protocol-relative URL', '//evil.example'],
    ['an absolute URL', 'https://evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a non-string', 42],
  ])('rejects %s', (_case, from) => {
    expect(safeReturnPath({ from })).toBeNull();
  });

  it('copes with missing state', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});
