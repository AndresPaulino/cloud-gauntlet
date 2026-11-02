// Highlight any text on a page and a small "Ask AI" button appears next to it.
// Clicking it sends the selection (plus the sentence around it) straight to the tutor.
import { useEffect, useState } from 'react';
import { useTutor } from './Tutor';

const MAX = 600;

/** The paragraph or list item the selection sits in, so short picks like "SCP" keep their meaning. */
function surrounding(sel: Selection): string {
  let n: Node | null = sel.anchorNode;
  while (n && !(n instanceof HTMLElement && /^(P|LI|TD|FIGCAPTION|DIV)$/.test(n.tagName))) n = n.parentNode;
  return (n?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX);
}

export function buildAskPrompt(picked: string, around: string) {
  const short = picked.length <= 40;
  const lines = [`Explain this in plain words: "${picked}"`];
  if (around && around !== picked) lines.push(`It appears here: "${around}"`);
  lines.push(short
    ? 'If it is an abbreviation or term, expand it first, then say what it means and why it matters for the SAA-C03 exam. Keep it short.'
    : 'Break it down for someone new to AWS, give a quick real-world example, and say why it matters for the SAA-C03 exam. Keep it short.');
  return lines.join('\n');
}

export function AskSelection() {
  const ask = useTutor((s) => s.ask);
  const [pos, setPos] = useState<{ x: number; y: number; text: string; around: string } | null>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
      if (!sel || sel.rangeCount === 0 || text.length < 2 || text.length > MAX) return setPos(null);
      const host = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      // Not inside the tutor itself, form fields, or anything that opts out.
      if (!host || host.closest('[role="dialog"], input, textarea, select, [data-no-ask]')) return setPos(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setPos(null);
      setPos({ x: Math.min(r.right, window.innerWidth - 120), y: r.bottom + 6, text, around: surrounding(sel) });
    };
    // mouseup/keyup instead of selectionchange: don't pop the button while a drag is still in progress.
    const later = () => setTimeout(update, 0);
    const hide = () => setPos(null);
    document.addEventListener('mouseup', later);
    document.addEventListener('keyup', later);
    window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('mouseup', later); document.removeEventListener('keyup', later); window.removeEventListener('scroll', hide, true); };
  }, []);

  if (!pos) return null;
  return (
    <button
      // Keep the selection alive when the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { ask(buildAskPrompt(pos.text, pos.around)); window.getSelection()?.removeAllRanges(); setPos(null); }}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[45] animate-pop flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink text-paper text-sm font-medium shadow-lg hover:opacity-90"
      data-no-ask
    >
      <span aria-hidden>✨</span> Ask AI about this
    </button>
  );
}
