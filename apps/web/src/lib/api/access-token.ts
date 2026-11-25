/**
 * The access token lives in memory only: never in localStorage or a readable cookie,
 * so injected scripts cannot lift it. A reload restores it through the refresh cookie.
 */
let accessToken: string | null = null;

export const accessTokenStore = {
  get: (): string | null => accessToken,
  set: (token: string): void => {
    accessToken = token;
  },
  clear: (): void => {
    accessToken = null;
  },
};
