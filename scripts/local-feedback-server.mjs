import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PREFIX = '/api/local-feedback';
const ORIGIN = 'http://localhost:5173';
const COOKIE = 'local_feedback_session';
const MAX_BODY = 8 * 1024 * 1024;
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
  async function updatePreview(id, type, value, revision) {
    const operation = pendingWrite.then(async () => {
      if (!(await readPatients()).some((patient) => patient.id === id)) return null;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      const path = join(directory, `preview-${id}.json`);
      let preview = { revision: 0, anamnese: null, tarefas: [] };
      try {
        preview = JSON.parse(await readFile(path, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (preview.revision !== revision) return false;
      preview[type] = value;
      preview.revision += 1;
      const temporary = join(directory, `.preview-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(preview), { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
      return preview;
    });
    pendingWrite = operation.catch(() => {});
    return operation;
  }
  async function readPreview(id) {
    if (!(await readPatients()).some((patient) => patient.id === id)) return null;
    try {
      return JSON.parse(await readFile(join(directory, `preview-${id}.json`), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { revision: 0, anamnese: null, tarefas: [] };
      throw error;
    }
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
      const previewMatch = path.match(
        /^\/api\/local-feedback\/patients\/([0-9a-f-]{36})\/preview$/,
      );
      if (previewMatch && req.method === 'GET') {
        const preview = await readPreview(previewMatch[1]);
        return preview ? respond(res, 200, preview) : respond(res, 404);
      }
      if (previewMatch && req.method === 'PUT') {
        let data;
        try {
          data = await body(req);
        } catch {
          return respond(res, 400);
        }
        const strings = (item, keys) =>
          item &&
          typeof item === 'object' &&
          keys.every((key) => typeof item[key] === 'string' && item[key].length <= 2000);
        const validAnamnese =
          data?.type === 'anamnese' &&
          strings(data.value, ['estado', 'valor', 'fonte', 'data']) &&
          ['pendente', 'informado', 'desconhecido', 'nao_se_aplica'].includes(data.value.estado);
        const validTasks =
          data?.type === 'tarefas' &&
          Array.isArray(data.value) &&
          data.value.length <= 100 &&
          data.value.every(
            (task) =>
              strings(task, [
                'descricao',
                'responsavel',
                'prazo',
                'prioridade',
                'estado',
                'acaoOuJustificativa',
              ]) && ['pendente', 'em_andamento', 'concluida', 'cancelada'].includes(task.estado),
          );
        const validGoals =
          data?.type === 'objetivos' &&
          Array.isArray(data.value) &&
          data.value.length <= 100 &&
          data.value.every(
            (goal) =>
              strings(goal, [
                'descricao',
                'area',
                'responsavel',
                'situacaoInicial',
                'observacaoProgresso',
                'dataRevisao',
                'estado',
              ]) &&
              ['descricao', 'area', 'responsavel', 'situacaoInicial', 'observacaoProgresso'].every(
                (key) => goal[key].trim().length > 0,
              ) &&
              ['proposto', 'em andamento', 'atingido', 'pausado', 'revisar', 'encerrado'].includes(
                goal.estado,
              ) &&
              /^\d{4}-\d{2}-\d{2}$/.test(goal.dataRevisao) &&
              !Number.isNaN(Date.parse(goal.dataRevisao)) &&
              new Date(goal.dataRevisao).toISOString().slice(0, 10) === goal.dataRevisao,
          );
        if (
          !Number.isSafeInteger(data?.revision) ||
          data.revision < 0 ||
          (!validAnamnese && !validTasks && !validGoals)
        )
          return respond(res, 400);
        const preview = await updatePreview(previewMatch[1], data.type, data.value, data.revision);
        if (preview === null) return respond(res, 404);
        if (preview === false) return respond(res, 409);
        return respond(res, 200, preview);
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
