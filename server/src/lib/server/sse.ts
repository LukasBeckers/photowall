// In-process broadcast hub for server-sent events. The single Node process is
// the source of truth — there's only one app container per deployment, so we
// don't need Redis or anything fancier.
import { EventEmitter } from 'node:events';
import type { PhotoSummary } from '$lib/types';

export type SSEEvent =
  | { type: 'photo.added'; photo: PhotoSummary }
  | { type: 'photo.hidden'; photoId: string }
  | { type: 'reaction.changed'; photoId: string; counts: Record<string, number> }
  | { type: 'photo.speed_changed'; photoId: string; speed: number }
  | { type: 'settings.changed'; settings: Record<string, unknown> };

class Hub {
  private emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(0);
  }
  broadcast(ev: SSEEvent) {
    this.emitter.emit('event', ev);
  }
  subscribe(fn: (ev: SSEEvent) => void): () => void {
    this.emitter.on('event', fn);
    return () => this.emitter.off('event', fn);
  }
}

const KEY = Symbol.for('photowall.sse.hub');
const g = globalThis as unknown as { [k: symbol]: Hub | undefined };
if (!g[KEY]) g[KEY] = new Hub();
export const hub: Hub = g[KEY] as Hub;
