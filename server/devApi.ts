// Vite dev-server middleware: progress file sync + Claude tutor proxy.
// Runs only under `npm run dev` (localhost), so the API key never reaches the browser.
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { streamTutor, tutorError, type TutorRequest } from '../src/lib/tutorCore';

const PROGRESS_FILE = resolve('progress/progress.json');
const MAX_BODY = 20 * 1024 * 1024;
async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function devApi(apiKey: string | undefined): Plugin {
  const client = apiKey ? new Anthropic({ apiKey }) : null;
  return {
    name: 'cloud-gauntlet-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        try {
          if (url === '/api/progress' && req.method === 'GET') {
            try {
              res.setHeader('Content-Type', 'application/json');
              res.end(await readFile(PROGRESS_FILE, 'utf8'));
            } catch {
              json(res, 404, { error: 'no progress file yet' });
            }
            return;
          }
          if (url === '/api/progress' && req.method === 'PUT') {
            const body = await readBody(req);
            const parsed = JSON.parse(body); // reject malformed JSON before touching the file
            await mkdir(dirname(PROGRESS_FILE), { recursive: true });
            await writeFile(PROGRESS_FILE, JSON.stringify(parsed, null, 1) + '\n', 'utf8');
            json(res, 200, { ok: true });
            return;
          }
          if (url === '/api/tutor/status') {
            json(res, 200, { enabled: !!client });
            return;
          }
          if (url === '/api/tutor' && req.method === 'POST') {
            if (!client) return json(res, 503, { error: 'Add ANTHROPIC_API_KEY to .env and restart `npm run dev`.' });
            const body = JSON.parse(await readBody(req)) as TutorRequest;
            const abort = new AbortController();
            req.on('close', () => abort.abort());
            let started = false;
            await streamTutor(client, body, (chunk) => {
              if (!started) {
                started = true;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache');
              }
              res.write(chunk);
            }, abort.signal);
            res.end();
            return;
          }
        } catch (e) {
          const msg = tutorError(e, 'Invalid API key in .env.');
          if (!res.headersSent) json(res, 500, { error: msg });
          else res.end(`\n\n**Error:** ${msg}`);
          return;
        }
        next();
      });
    },
  };
}
