<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { REACTION_EMOJI } from '$lib/emoji';
  import type { PhotoSummary } from '$lib/types';

  type Cell = { key: number; photo: PhotoSummary } | null;

  const CELL_COUNT = 12;
  const CYCLE_MS = 5000;
  const PULSE_MS = 800;

  let cells: Cell[] = Array.from({ length: CELL_COUNT }, () => null);
  let pool: PhotoSummary[] = [];
  let pulses: Map<string, number> = new Map(); // photoId -> timestamp of last reaction change
  let cellSeq = 0;
  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  let es: EventSource | null = null;
  let displayUrl = '';
  let qrSvg = '';

  function nextKey() {
    return ++cellSeq;
  }

  function addOrUpdatePoolPhoto(p: PhotoSummary, prepend = false) {
    const idx = pool.findIndex((x) => x.id === p.id);
    if (idx >= 0) pool[idx] = p;
    else if (prepend) pool = [p, ...pool];
    else pool = [...pool, p];
  }

  function withWallParam(url: string): string {
    if (url.includes('wall=1')) return url;
    return url + (url.includes('?') ? '&' : '?') + 'wall=1';
  }
  function tagForWall(p: PhotoSummary): PhotoSummary {
    return {
      ...p,
      thumb: withWallParam(p.thumb),
      wall: withWallParam(p.wall),
      original: withWallParam(p.original)
    };
  }

  function placeNew(p0: PhotoSummary) {
    const photo = tagForWall(p0);
    addOrUpdatePoolPhoto(photo, true);
    // Prefer an empty cell, otherwise pick a random non-empty one.
    let target = cells.findIndex((c) => c === null);
    if (target < 0) target = Math.floor(Math.random() * CELL_COUNT);
    cells[target] = { key: nextKey(), photo };
    cells = cells;
  }

  function cycle() {
    if (pool.length === 0) return;
    // Find a cell to swap. Prefer cells whose photo is duplicated elsewhere or
    // any random cell if pool is bigger than CELL_COUNT.
    const target = Math.floor(Math.random() * CELL_COUNT);
    const visibleIds = new Set(cells.map((c) => c?.photo.id).filter(Boolean));
    const candidates = pool.filter((p) => !visibleIds.has(p.id));
    const pick =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : pool[Math.floor(Math.random() * pool.length)];
    cells[target] = { key: nextKey(), photo: pick };
    cells = cells;
  }

  function applyReactionChange(photoId: string, counts: Record<string, number>) {
    // Update pool
    pool = pool.map((p) => (p.id === photoId ? { ...p, reactions: counts } : p));
    // Update visible cells (without changing the key, so no re-animation)
    cells = cells.map((c) =>
      c && c.photo.id === photoId ? { ...c, photo: { ...c.photo, reactions: counts } } : c
    );
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
    pool = pool.filter((p) => p.id !== photoId);
    cells = cells.map((c) => (c && c.photo.id === photoId ? null : c));
  }

  onMount(async () => {
    const initial = await fetch('/api/wall/initial').then((r) => r.json());
    pool = initial.photos as PhotoSummary[];
    displayUrl = (initial.displayUrl ?? '').replace(/^https?:\/\//, '');
    qrSvg = initial.qr ?? '';
    // Fill cells with the most recent photos.
    for (let i = 0; i < Math.min(pool.length, CELL_COUNT); i++) {
      cells[i] = { key: nextKey(), photo: pool[i] };
    }
    cells = cells;

    cycleTimer = setInterval(cycle, CYCLE_MS);

    es = new EventSource('/api/sse?wall=1');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'photo.added') placeNew(msg.photo);
        else if (msg.type === 'reaction.changed') applyReactionChange(msg.photoId, msg.counts);
        else if (msg.type === 'photo.hidden') applyHidden(msg.photoId);
      } catch {
        // ignore
      }
    };
  });

  onDestroy(() => {
    if (cycleTimer) clearInterval(cycleTimer);
    if (es) es.close();
  });
</script>

<svelte:head>
  <title>Photowall · TV</title>
</svelte:head>

<div class="wall">
  <div class="grid">
    {#each cells as cell, i (i)}
      <div class="slot">
        {#if cell}
          {#key cell.key}
            <div
              class="cell"
              in:scale={{ duration: 600, start: 0.85, easing: quintOut }}
              out:fade={{ duration: 300 }}
            >
              <img src={cell.photo.wall} alt="" />
              <div class="overlay">
                {#each REACTION_EMOJI as emoji}
                  {#if cell.photo.reactions[emoji]}
                    <span class="r" class:pulse={pulses.has(cell.photo.id)}>
                      {emoji}{cell.photo.reactions[emoji]}
                    </span>
                  {/if}
                {/each}
              </div>
            </div>
          {/key}
        {/if}
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
      <div class="hint">scan the QR — no password needed</div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }
  .wall {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(2, auto);
    gap: 6px;
    padding: 6px;
    width: 100vw;
    box-sizing: border-box;
  }
  .slot {
    position: relative;
    overflow: hidden;
    background: #0d0d0f;
    border-radius: 6px;
    aspect-ratio: 3 / 4;
  }
  .cell {
    position: absolute;
    inset: 0;
  }
  .cell img {
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
  }
  .qr {
    background: #fff;
    padding: 6px;
    border-radius: 8px;
    flex-shrink: 0;
    line-height: 0;
  }
  .qr :global(svg) {
    width: 110px;
    height: 110px;
    display: block;
  }
  .banner-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
  }
  .prompt {
    font-size: 1.05rem;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: 0.02em;
  }
  .url {
    font-size: 1.6rem;
    font-weight: 600;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .hint {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.55);
  }
</style>
