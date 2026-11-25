import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';

/** A URI to a database no other test file uses, on the shared in-memory server. */
export function isolatedMongoUri(): string {
  const url = new URL(inject('mongoUri'));
  url.pathname = `/test-${randomUUID()}`;
  return url.toString();
}
