// "Ask the tutor": a drawer that streams answers from the local /api/tutor proxy, or, on the hosted
// static site (no dev server), straight from the browser with an API key the visitor pastes in.
// Pages call setTutorContext(...) so the tutor knows what you're looking at.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/store';
import { Md } from './Md';

interface Msg { role: 'user' | 'assistant'; content: string }
interface TutorUi {
  isOpen: boolean; context: string; contextLabel: string; messages: Msg[]; draft: string;
  /** A question to send as soon as the drawer is ready (from "Ask AI about this"). */
  pending: string;
  open: (prompt?: string) => void; ask: (question: string) => void; close: () => void; setContext: (label: string, text: string) => void; setMessages: (m: Msg[]) => void; setDraft: (d: string) => void;
}
export const useTutor = create<TutorUi>((set) => ({
  isOpen: false, context: '', contextLabel: '', messages: [], draft: '', pending: '',
  open: (prompt) => set((s) => ({ isOpen: true, draft: prompt ?? s.draft })),
  ask: (question) => set({ isOpen: true, pending: question }),
  close: () => set({ isOpen: false }),
  setContext: (contextLabel, context) => set({ contextLabel, context }),
  setMessages: (messages) => set({ messages }),
  setDraft: (draft) => set({ draft }),
}));

// Contexts nest (a lesson page holds a question card), so keep a stack: when the inner one
// unmounts, the outer one comes back instead of the tutor going blind.
const ctxStack: { label: string; text: string }[] = [];
const showTop = () => { const top = ctxStack.at(-1); useTutor.getState().setContext(top?.label ?? '', top?.text ?? ''); };

/** Register what the learner is looking at; restored to the enclosing context on unmount. */
export function useTutorContext(label: string, text: string) {
  useEffect(() => {
    if (!label && !text) return;
    const entry = { label, text };
    ctxStack.push(entry);
    showTop();
    return () => { ctxStack.splice(ctxStack.lastIndexOf(entry), 1); showTop(); };
  }, [label, text]);
}

// Hosted site only: the visitor's own key. It lives in this browser's storage and is sent only to Anthropic.
const KEY_STORE = 'cloud-gauntlet-tutor-key';
const readKey = () => { try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; } };
const writeKey = (k: string) => { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch { /* storage blocked: key lasts for this page only */ } };

/** `hosted` = no dev server (static site): the tutor uses the visitor's key. Otherwise the server says if .env has one. */
let statusCache: { hosted: boolean; serverEnabled: boolean } | null = null;
async function tutorStatus() {
  if (statusCache) return statusCache;
  try {
    const r = await fetch('/api/tutor/status');
    const isApi = r.ok && (r.headers.get('content-type') ?? '').includes('json');
    statusCache = { hosted: !isApi, serverEnabled: isApi ? !!(await r.json()).enabled : false };
  } catch { statusCache = { hosted: true, serverEnabled: false }; }
  return statusCache;
}

export function TutorDrawer() {
  const t = useTutor();
  const model = useStore((s) => s.profile.tutorModel);
  const setProfile = useStore((s) => s.setProfile);
  const [status, setStatus] = useState<{ hosted: boolean; serverEnabled: boolean } | null>(null);
  const [key, setKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState('');
  const hosted = !!status?.hosted;
  const enabled = status === null ? null : hosted ? !!key : status.serverEnabled;
  const saveKey = (k: string) => { writeKey(k); setKey(k); setKeyDraft(''); };
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { if (t.isOpen) void tutorStatus().then(setStatus); }, [t.isOpen]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [t.messages]);
  useEffect(() => {
    if (!t.pending || enabled === null || busy) return;
    const q = t.pending;
    useTutor.setState({ pending: '' });
    if (enabled) void send(q); else t.setDraft(q);
  }, [t.pending, enabled, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history: Msg[] = [...t.messages, { role: 'user', content: text }];
    t.setMessages([...history, { role: 'assistant', content: '' }]);
    t.setDraft('');
    setBusy(true);
    abort.current = new AbortController();
    try {
      const body = { model, context: t.context ? `[${t.contextLabel}]
${t.context}` : '', messages: history };
      let acc = '';
      const onText = (chunk: string) => { acc += chunk; t.setMessages([...history, { role: 'assistant', content: acc }]); };
      if (hosted) {
        // Loaded on demand so the SDK stays out of the main bundle.
        const core = await import('../lib/tutorCore');
        try { await core.streamTutor(core.browserClient(key), body, onText, abort.current.signal); }
        catch (e) { if (abort.current.signal.aborted) return; throw new Error(core.tutorError(e, 'That API key was rejected. Remove it below and paste a valid one.')); }
        return;
      }
      const r = await fetch('/api/tutor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify(body),
      });
      if (!r.ok || !r.body) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(err.error);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onText(dec.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') t.setMessages([...history, { role: 'assistant', content: `**Couldn't reach the tutor:** ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!t.isOpen) return null;
  const quick = t.contextLabel
    ? ['Explain this like I’m new to AWS', 'Why is my answer wrong?', 'Give me a real-world example', 'What will the exam try to trick me with here?']
    : ['Quiz me on IAM policy evaluation', 'When do I pick NLB over ALB?', 'Explain the 4 DR strategies with costs', 'Make me a 30-minute study session'];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Tutor">
      <div className="absolute inset-0 bg-black/30" onClick={t.close} />
      <div className="relative w-full max-w-[460px] h-full bg-surface border-l border-line flex flex-col shadow-2xl">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-line">
          <div className="font-display font-bold text-lg">Tutor</div>
          <select className="ml-2 text-sm bg-sunk rounded px-2 py-1" value={model} onChange={(e) => setProfile({ tutorModel: e.target.value as 'sonnet' | 'opus' })} aria-label="Tutor model">
            <option value="sonnet">Sonnet 5.5 · fast</option>
            <option value="opus">Opus 5.5 · deepest</option>
          </select>
          <button className="ml-auto text-sm px-2 py-1 rounded hover:bg-sunk" onClick={() => t.setMessages([])}>Clear</button>
          <button className="text-lg px-2 rounded hover:bg-sunk" onClick={t.close} aria-label="Close tutor">✕</button>
        </div>
        {t.contextLabel && <div className="px-4 py-2 text-xs text-muted border-b border-line bg-sunk">Looking at: <b className="text-ink">{t.contextLabel}</b></div>}
        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {enabled === false && hosted && (
            <form className="rounded-lg border border-line p-4 text-sm prose-lite" onSubmit={(e) => { e.preventDefault(); if (keyDraft.trim()) saveKey(keyDraft.trim()); }}>
              <p><b>The tutor is optional and runs on your own Anthropic API key.</b> Everything else in Cloud Gauntlet works without it.</p>
              <label className="block mt-2">
                <span className="block text-xs text-muted mb-1">Anthropic API key</span>
                <input type="password" autoComplete="off" spellCheck={false} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-..."
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[13px]" />
              </label>
              <button type="submit" disabled={!keyDraft.trim()} className="mt-2 px-3 py-1.5 rounded-lg bg-ink text-paper font-medium disabled:opacity-40">Save key in this browser</button>
              <ul className="text-muted mt-3">
                <li>The key is stored only in this browser and sent only to Anthropic. This site has no server.</li>
                <li>Anything else running in this browser (extensions, other people on a shared computer) could read it. Use a separate key with a low spend limit, and remove it when you are done.</li>
                <li>Prefer not to paste a key? Clone the repo and run it locally: the key then stays in a <code>.env</code> file on your machine.</li>
              </ul>
            </form>
          )}
          {enabled === false && !hosted && (
            <div className="rounded-lg border border-line p-4 text-sm prose-lite">
              <p><b>The tutor needs your Anthropic API key.</b></p>
              <p>1. Copy <code>.env.example</code> to <code>.env</code> in the project folder.<br />2. Paste your key after <code>ANTHROPIC_API_KEY=</code>.<br />3. Restart <code>npm run dev</code>.</p>
              <p className="text-muted">The key stays on your machine: the local dev server calls Claude, so your browser never sees it.</p>
            </div>
          )}
          {t.messages.length === 0 && enabled !== false && <p className="text-sm text-muted">Ask anything about AWS or the exam. I can see the lesson, question or lab you have open.</p>}
          {t.messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ml-8 rounded-2xl rounded-br-sm bg-ink text-paper px-4 py-2.5 text-[15px]' : 'text-[15px] prose-lite'}>
              {m.role === 'user' ? m.content : m.content ? <Md text={m.content} /> : <span className="text-muted">Thinking…</span>}
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          {hosted && key && <div className="text-xs text-muted mb-2 flex items-center gap-2">Using your API key, stored in this browser.<button type="button" className="underline" onClick={() => saveKey('')}>Remove key</button></div>}
          {t.messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quick.map((q) => <button key={q} onClick={() => send(q)} disabled={enabled === false} className="text-xs px-2.5 py-1 rounded-full border border-line hover:bg-sunk disabled:opacity-40">{q}</button>)}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); void send(t.draft); }} className="flex gap-2">
            <textarea value={t.draft} onChange={(e) => t.setDraft(e.target.value)} rows={2} placeholder="Ask a question…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(t.draft); } }}
              className="flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-[15px]" />
            {busy
              ? <button type="button" onClick={() => abort.current?.abort()} className="px-4 rounded-lg border border-line">Stop</button>
              : <button type="submit" disabled={enabled === false} className="px-4 rounded-lg bg-ink text-paper font-medium disabled:opacity-40">Send</button>}
          </form>
        </div>
      </div>
    </div>
  );
}
