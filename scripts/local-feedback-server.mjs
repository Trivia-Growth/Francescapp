import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PREFIX = '/api/local-feedback';
const ORIGIN = 'http://localhost:5173';
const COOKIE = 'local_feedback_session';
const MAX_BODY = 4096;
export const defaultFeedbackDirectory = join(
  homedir(),
  'Library',
  'Application Support',
  'FFCMApp Feedback',
);

export function createLocalFeedbackServer({ password, directory }) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('LOCAL_FEEDBACK_PASSWORD deve ter pelo menos 12 caracteres.');
  }
  const passwordHash = createHash('sha256').update(password).digest();
  const sessions = new Map();
  const attempts = [];
  let pendingWrite = Promise.resolve();
  const file = join(directory, 'patients.json');

  async function readPatients() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(data)) throw new Error('Invalid storage');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async function addPatient(patient) {
    const operation = pendingWrite.then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      const patients = await readPatients();
      patients.push(patient);
      const temporary = join(directory, `.patients-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(patients), { mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    });
    pendingWrite = operation.catch(() => {});
    return operation;
  }
  function respond(res, status, body, headers = {}) {
    res.writeHead(status, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }
  function session(req) {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const entry = sessions.get(token);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return entry;
  }
  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new Error('body too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  return createServer(async (req, res) => {
    try {
      // Accept only literal loopback hosts, including the Vite proxy host.
      if (
        !['127.0.0.1:4174', 'localhost:5173'].includes(req.headers.host) ||
        req.socket.remoteAddress !== '127.0.0.1'
      )
        return respond(res, 403);
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (!path.startsWith(`${PREFIX}/`)) return respond(res, 404);
      if (
        req.method !== 'GET' &&
        (req.headers.origin !== ORIGIN || req.headers['content-type'] !== 'application/json')
      )
        return respond(res, 403);
      if (req.method === 'GET' && req.headers.origin && req.headers.origin !== ORIGIN)
        return respond(res, 403);
      if (path === `${PREFIX}/session` && req.method === 'GET') {
        const current = session(req);
        return respond(
          res,
          200,
          current
            ? { authenticated: true, csrfToken: current.csrfToken }
            : { authenticated: false },
        );
      }
      if (path === `${PREFIX}/login` && req.method === 'POST') {
        const now = Date.now();
        while (attempts.length && attempts[0] <= now - 60_000) attempts.shift();
        if (attempts.length >= 10) return respond(res, 429);
        attempts.push(now);
        let data;
        try {
          data = await body(req);
        } catch {
          return respond(res, 400);
        }
        if (
          !data ||
          typeof data.password !== 'string' ||
          !timingSafeEqual(createHash('sha256').update(data.password).digest(), passwordHash)
        )
          return respond(res, 401);
        attempts.length = 0;
        const token = randomBytes(32).toString('hex');
        const csrfToken = randomBytes(32).toString('hex');
        sessions.set(token, { expires: now + 8 * 60 * 60 * 1000, csrfToken });
        return respond(
          res,
          200,
          { authenticated: true, csrfToken },
          {
            'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/local-feedback; Max-Age=28800`,
          },
        );
      }
      const current = session(req);
      if (!current) return respond(res, 401);
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== current.csrfToken)
        return respond(res, 403);
      if (path === `${PREFIX}/logout` && req.method === 'POST') {
        const token = (req.headers.cookie || '')
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${COOKIE}=`))
          ?.slice(COOKIE.length + 1);
        sessions.delete(token);
        return respond(res, 204, undefined, {
          'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/local-feedback; Max-Age=0`,
        });
      }
      if (path === `${PREFIX}/patients` && req.method === 'GET')
        return respond(res, 200, { patients: await readPatients() });
      if (path === `${PREFIX}/patients` && req.method === 'POST') {
        let data;
        try {
          data = await body(req);
        } catch {
          return respond(res, 400);
        }
        if (
          !data ||
          typeof data.name !== 'string' ||
          !data.name.trim() ||
          data.name.trim().length > 200 ||
          (data.preferredName !== undefined &&
            (typeof data.preferredName !== 'string' || data.preferredName.trim().length > 200))
        )
          return respond(res, 400);
        const patient = {
          id: randomUUID(),
          name: data.name.trim(),
          preferredName: (data.preferredName || '').trim(),
        };
        await addPatient(patient);
        return respond(res, 201, { patient });
      }
      return respond(res, 404);
    } catch {
      return respond(res, 500);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createLocalFeedbackServer({
      password: process.env.LOCAL_FEEDBACK_PASSWORD,
      directory: defaultFeedbackDirectory,
    });
    server.listen(4174, '127.0.0.1', () =>
      console.log('Serviço de feedback local ativo em 127.0.0.1:4174; somente dados fictícios.'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
