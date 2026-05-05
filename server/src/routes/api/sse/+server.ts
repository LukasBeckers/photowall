import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hub } from '$lib/server/sse';

export const GET: RequestHandler = async ({ url, locals, request }) => {
  const isWall = url.searchParams.get('wall') === '1';
  // Wall stream is unauthenticated (the TV doesn't have a keyboard).
  // Everything else requires a session.
  if (!isWall && !locals.session) throw error(401, 'Unauthorized');

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      // Initial hello — useful so EventSource fires onopen reliably.
      send({ type: 'hello', ts: Date.now() });

      const unsub = hub.subscribe((ev) => send(ev));

      // Heartbeat every 20s to keep proxies from buffering us out.
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: hb\n\n`));
        } catch {
          // ignore
        }
      }, 20_000);

      const cleanup = () => {
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener('abort', cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive'
    }
  });
};
