// Starts the built API on a throwaway in-memory MongoDB, so the browser tests need no database and
// no credentials. (CI also runs them against the Docker stack, with its real, authenticated one.)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const apiDirectory = fileURLToPath(new URL('../../apps/api', import.meta.url));
const mongo = await MongoMemoryServer.create();

const api = spawn(process.execPath, ['dist/main.js'], {
  cwd: apiDirectory,
  stdio: 'inherit',
  env: { ...process.env, MONGODB_URI: mongo.getUri('auth-app-e2e') },
});

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  api.kill();
  await mongo.stop();
  process.exit(code);
}

api.on('exit', (code) => void stop(code ?? 0));
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
