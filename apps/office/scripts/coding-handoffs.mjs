// One owner terminal reviews work for one Odd. A coding tool can propose and
// read its answer. Only the terminal can send the reviewed text to the chat.
import { createHmac } from 'node:crypto';
import { z } from 'zod';

export const requestId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const offer = z.object({
  requestId,
  message: z.string().min(1).max(16000),
  files: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,95}\.(txt|md|csv|json)$/i),
        text: z.string().max(16000)
      })
    )
    .max(4)
    .optional()
});

// The source and the Odd scope the chat turn. Retrying an approved request
// after reconnecting to the same office reuses the normal saved-turn handling.
function turnFor(key, odd, id) {
  const hex = createHmac('sha256', key)
    .update(JSON.stringify(['coding-tool-turn', odd, id]))
    .digest('hex');
  return hex.slice(0, 32).replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
}

export function shown(value) {
  // A selection can contain terminal escapes or text-direction controls.
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  );
}

export function handoffs(key, odd, deliver, tell) {
  const requests = new Map();
  let next = 1;
  let waiting;

  function result(id) {
    const entry = requests.get(id);
    if (!entry) throw Error('No request with that ID in this sharing session.');
    return {
      requestId: id,
      status: entry.status,
      ...(entry.answer !== undefined && { answer: entry.answer })
    };
  }

  function propose(body) {
    const parsed = offer.safeParse(body);
    if (!parsed.success)
      throw Error('Provide a request ID, a message and up to four named text files.');
    const { requestId: id, message, files = [] } = parsed.data;
    if (!message.trim() || new Set(files.map((f) => f.name.toLowerCase())).size !== files.length)
      throw Error('Write a message and give each file a different name.');
    const selection = JSON.stringify({ message, files });
    if (Buffer.byteLength(selection) > 16384)
      throw Error('Use up to 16 KiB of selected text per request.');
    const existing = requests.get(id);
    if (existing) {
      if (existing.selection !== selection)
        throw Error('That request ID already names different work.');
      return result(id);
    }
    if (waiting)
      throw Error(
        'The owner is reviewing or sending another request. Try again after it finishes.'
      );
    if (requests.size >= 64)
      throw Error('This session has 64 requests. Ask the owner to start a new session.');
    const entry = { number: next++, id, selection, status: 'waiting for owner' };
    requests.set(id, entry);
    waiting = entry;
    tell(
      shown({ to: odd, message, files }) +
        '\nTo send this selection and share the reply, type send ' +
        entry.number +
        '. To decline, type decline ' +
        entry.number +
        '.'
    );
    return result(id);
  }

  async function decide(line) {
    const entry = waiting;
    if (!entry || entry.status !== 'waiting for owner') return;
    if (line === 'decline ' + entry.number) {
      entry.status = 'declined';
      waiting = undefined;
      tell('Declined request ' + entry.number + '.');
      return;
    }
    if (line !== 'send ' + entry.number) return;
    entry.status = 'running';
    try {
      const { message, files } = JSON.parse(entry.selection);
      entry.answer = await deliver({
        turnId: turnFor(key, odd, entry.id),
        message,
        files: files.map((f) => ({ name: f.name, data: Buffer.from(f.text).toString('base64') }))
      });
      entry.status = 'finished';
    } catch {
      entry.status = 'check the office chat';
    } finally {
      waiting = undefined;
      tell('Request ' + entry.number + ': ' + entry.status + '.');
    }
  }
  return { propose, result, decide };
}
