<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { REACTION_EMOJI } from '$lib/emoji';
  import { isVideo } from '$lib/types';
  import type { PhotoSummary } from '$lib/types';
  import { api } from '$lib/api';

  type Item = { key: number; photo: PhotoSummary; size: 1 | 2 };

  // Reaction-based tuning constants ("subtle" defaults).
  const STICKY_PER_REACTION = 0.15; // P(stay) per reaction, capped
  const STICKY_CAP = 0.7;
  const PROMOTE_THRESHOLD = 3; // total reactions to be a 2x2 candidate
  const PROMOTE_PROB = 0.3;
  const PULSE_MS = 800;
  // In-memory pool. Larger than any reasonable maxItems so that growing the
  // admin slider expands visible[] without needing a refresh, and so the
  // sticky-bubble cascade has slack at the back instead of dropping a
  // currently-playing video tile every time a new photo arrives.
  const POOL_MAX = 200;

  let items: Item[] = [];
  let pulses: Map<string, number> = new Map();
  let seq = 0;
  let es: EventSource | null = null;

  let displayUrl = '';
  let qrSvg = '';
  let partyPassword = '';
  let cellSize = 200;
  // Hard cap on rendered tiles. Bounds both items[] and visible[] so decode/
  // composite cost stays predictable. Live-updated via the admin slider.
  let maxItems = 40;

  let cols = 6;
  let rows = 2;
  $: capacity = cols * rows;

  $: visible = (() => {
    const out: Item[] = [];
    let used = 0;
    for (const it of items) {
      const u = it.size === 2 ? 4 : 1;
      if (used + u > capacity) break;
      if (out.length >= maxItems) break;
      out.push(it);
      used += u;
    }
    return out;
  })();

  function totalReactions(p: PhotoSummary): number {
    let t = 0;
    for (const v of Object.values(p.reactions ?? {})) t += v;
    return t;
  }
  function stickiness(p: PhotoSummary): number {
    return Math.min(STICKY_CAP, totalReactions(p) * STICKY_PER_REACTION);
  }

  function placeNew(photo: PhotoSummary) {
    const arrival: Item = { photo, size: 1, key: ++seq };
    let toPlace: Item | null = arrival;
    const out: Item[] = [];
    for (const cur of items) {
      if (toPlace === null) {
        out.push(cur);
        continue;
      }
      if (Math.random() < stickiness(cur.photo)) {
        // sticky: cur stays in place; new arrival keeps looking for a slot
        out.push(cur);
      } else {
        // arrival takes this slot, current item gets bumped further down
        out.push(toPlace);
        toPlace = cur;
      }
    }
    if (toPlace) out.push(toPlace);
    items = out.slice(0, POOL_MAX);
  }

  function applyReactionChange(photoId: string, counts: Record<string, number>) {
    let promoted = false;
    items = items.map((it) => {
      if (it.photo.id !== photoId) return it;
      const newPhoto = { ...it.photo, reactions: counts };
      let newSize = it.size;
      if (
        it.size === 1 &&
        Object.values(counts).reduce((a, b) => a + b, 0) >= PROMOTE_THRESHOLD &&
        Math.random() < PROMOTE_PROB
      ) {
        newSize = 2;
        promoted = true;
      }
      return { ...it, photo: newPhoto, size: newSize };
    });
    pulses.set(photoId, Date.now());
    pulses = pulses;
    setTimeout(() => {
      const t = pulses.get(photoId);
      if (t && Date.now() - t >= PULSE_MS) {
        pulses.delete(photoId);
        pulses = pulses;
      }
    }, PULSE_MS + 50);
  }

  function applyHidden(photoId: string) {
    items = items.filter((it) => it.photo.id !== photoId);
  }

  function applySpeedChange(photoId: string, speed: number) {
    items = items.map((it) =>
      it.photo.id === photoId ? { ...it, photo: { ...it.photo, speed } } : it
    );
  }

  // Svelte action: keep a video element's playbackRate in sync with `speed`.
  // Some browsers reset playbackRate when the source loads, so we reapply on
  // loadedmetadata too.
  function videoRate(node: HTMLVideoElement, initial: number) {
    let current = initial || 1;
    const apply = () => {
      node.playbackRate = current;
    };
    apply();
    node.addEventListener('loadedmetadata', apply);
    return {
      update(next: number) {
        current = next || 1;
        node.playbackRate = current;
      },
      destroy() {
        node.removeEventListener('loadedmetadata', apply);
      }
    };
  }

  function bannerHeight(): number {
    const el = document.querySelector('.banner') as HTMLElement | null;
    return el ? el.offsetHeight : 140;
  }

  function recompute() {
    const w = window.innerWidth;
    const h = window.innerHeight - bannerHeight();
    const c = Math.max(2, Math.floor((w - 12) / cellSize));
    const rowH = (cellSize * 4) / 3;
    const r = Math.max(1, Math.floor((h - 12) / rowH));
    cols = c;
    rows = r;
    document.documentElement.style.setProperty('--cols', String(c));
    document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
  }

  onMount(async () => {
    const initial = await api('/api/wall/initial').then((r) => r.json());
    const photos = (initial.photos as PhotoSummary[]) ?? [];
    if (typeof initial.maxCells === 'number') maxItems = initial.maxCells;
    items = photos
      .slice(0, POOL_MAX)
      .map((photo) => ({ photo, size: 1 as const, key: ++seq }));
    displayUrl = (initial.displayUrl ?? '').replace(/^https?:\/\//, '');
    qrSvg = initial.qr ?? '';
    partyPassword = initial.partyPassword ?? '';
    if (typeof initial.cellSize === 'number') cellSize = initial.cellSize;

    recompute();
    window.addEventListener('resize', recompute);

    es = new EventSource('/api/sse');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'photo.added') placeNew(msg.photo);
        else if (msg.type === 'reaction.changed') applyReactionChange(msg.photoId, msg.counts);
        else if (msg.type === 'photo.hidden') applyHidden(msg.photoId);
        else if (msg.type === 'photo.speed_changed') applySpeedChange(msg.photoId, msg.speed);
        else if (msg.type === 'settings.changed') {
          if (typeof msg.settings?.wall_cell_size === 'number') {
            cellSize = msg.settings.wall_cell_size;
            recompute();
          }
          if (typeof msg.settings?.wall_max_cells === 'number') {
            // Pool stays at POOL_MAX; visible[] picks up the new cap on its
            // next reactive run. Growing or shrinking is symmetrical now.
            maxItems = msg.settings.wall_max_cells;
          }
        }
      } catch {
        // ignore
      }
    };
  });

  onDestroy(() => {
    // onDestroy also fires at SSR teardown where `window` is undefined.
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', recompute);
    }
    if (es) es.close();
  });
</script>

<svelte:head>
  <title>Photowall · TV</title>
</svelte:head>

<div class="wall">
  <div class="grid">
    {#each visible as item (item.key)}
      <div class="slot" class:size-2={item.size === 2}>
        <div class="cell">
          {#if isVideo(item.photo)}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
              use:videoRate={item.photo.speed}
              src={item.photo.wallVideo ?? item.photo.original}
              poster={item.photo.wall}
              autoplay
              loop
              muted
              playsinline
              preload="metadata"
            ></video>
          {:else}
            <img src={item.photo.wall} alt="" />
          {/if}
          <div class="overlay">
            {#each REACTION_EMOJI as emoji}
              {#if item.photo.reactions[emoji]}
                <span class="r" class:pulse={pulses.has(item.photo.id)}>
                  {emoji}{item.photo.reactions[emoji]}
                </span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="banner">
    {#if qrSvg}
      <div class="qr">{@html qrSvg}</div>
    {/if}
    <div class="banner-text">
      <div class="prompt">📸 Upload your photos here</div>
      {#if displayUrl}
        <div class="url">{displayUrl}</div>
      {/if}
      {#if partyPassword}
        <div class="pw">password: <span class="pw-val">{partyPassword}</span></div>
      {/if}
      <div class="hint">…or scan the QR — no password needed</div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }
  :global(html) {
    --cols: 6;
    --cell-size: 200px;
  }
  .wall {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    flex-direction: column;
  }
  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: calc(var(--cell-size) * 4 / 3);
    grid-auto-flow: dense;
    gap: 6px;
    padding: 6px;
    width: 100vw;
    box-sizing: border-box;
    align-content: start;
    overflow: hidden;
  }
  .slot {
    position: relative;
    overflow: hidden;
    background: #0d0d0f;
    border-radius: 6px;
  }
  .slot.size-2 {
    grid-column: span 2;
    grid-row: span 2;
  }
  .cell {
    position: absolute;
    inset: 0;
  }
  .cell img,
  .cell video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .overlay {
    position: absolute;
    bottom: 6px;
    right: 6px;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: calc(100% - 12px);
  }
  .r {
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    backdrop-filter: blur(4px);
    transition: transform 0.18s ease, background 0.18s ease;
  }
  .r.pulse {
    transform: scale(1.18);
    background: rgba(255, 79, 139, 0.85);
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 0.75rem 1.25rem 1rem;
    color: rgba(255, 255, 255, 0.92);
    flex-shrink: 0;
  }
  .qr {
    background: #fff;
    padding: 6px;
    border-radius: 8px;
    flex-shrink: 0;
    line-height: 0;
  }
  .qr :global(svg) {
    width: 120px;
    height: 120px;
    display: block;
  }
  .banner-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
  }
  .prompt {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: 0.02em;
  }
  .url {
    font-size: 1.55rem;
    font-weight: 700;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    line-height: 1.1;
  }
  .pw {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.72);
  }
  .pw-val {
    color: var(--accent-2);
    font-weight: 700;
    letter-spacing: 0.05em;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .hint {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.5);
  }
</style>
