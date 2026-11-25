/**
 * The access token lives in memory only: never in localStorage or a readable cookie,
 * so injected scripts cannot lift it. A reload restores it through the refresh cookie.
 *
 * `generation` changes on every clear(), so a refresh that started before a sign-out can
 * tell that its result is stale and drop it instead of signing the user back in.
 */
let accessToken: string | null = null;
let generation = 0;

export const accessTokenStore = {
  get: (): string | null => accessToken,
  set: (token: string): void => {
    accessToken = token;
  },
  clear: (): void => {
    accessToken = null;
    generation += 1;
  },
  generation: (): number => generation,
};
