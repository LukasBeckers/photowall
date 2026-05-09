<script lang="ts">
  import type { PageData } from './$types';
  import { api } from '$lib/api';
  export let data: PageData;

  let photos = data.photos;
  let filter: 'all' | 'guest' | 'sdcard' | 'hidden' = 'all';
  let busy: Set<string> = new Set();
  let cellSize = data.cellSize;
  let maxCells = data.maxCells;
  let slideshowMode: 'off' | 'on' | 'auto' = data.slideshowMode as 'off' | 'on' | 'auto';
  let slideshowSeconds = data.slideshowSeconds;
  let autoMosaicMin = data.autoMosaicMin;
  let autoSlideshowMin = data.autoSlideshowMin;

  // One debounced putter for every key — avoids hammering the server
  // while sliders are being dragged.
  const timers: Record<string, ReturnType<typeof setTimeout> | null> = {};
  function debouncedPut(key: string, value: unknown, delay = 200) {
    if (timers[key]) clearTimeout(timers[key]!);
    timers[key] = setTimeout(async () => {
      await api('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
    }, delay);
  }

  function onCellSizeInput() { debouncedPut('wall_cell_size', cellSize); }
  function onMaxCellsInput() { debouncedPut('wall_max_cells', maxCells); }
  function onSlideshowModeChange() { debouncedPut('wall_slideshow_mode', slideshowMode, 0); }
  function onSlideshowSecondsInput() { debouncedPut('wall_slideshow_seconds', slideshowSeconds); }
  function onAutoMosaicInput() { debouncedPut('wall_auto_mosaic_min', autoMosaicMin); }
  function onAutoSlideshowInput() { debouncedPut('wall_auto_slideshow_min', autoSlideshowMin); }

  $: visiblePhotos = photos.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'hidden') return p.hiddenAt !== null;
    return p.source === filter;
  });

  async function setHidden(id: string, hide: boolean) {
    busy.add(id);
    busy = busy;
    try {
      const res = await api(`/api/admin/photos/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hidden: hide })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      photos = photos.map((p) =>
        p.id === id ? { ...p, hiddenAt: hide ? new Date().toISOString() : null } : p
      );
    } finally {
      busy.delete(id);
      busy = busy;
    }
  }

  async function hardDelete(id: string) {
    if (!confirm('Permanently delete this photo? Cannot be undone.')) return;
    busy.add(id);
    busy = busy;
    try {
      const res = await api(`/api/admin/photos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      photos = photos.filter((p) => p.id !== id);
    } finally {
      busy.delete(id);
      busy = busy;
    }
  }

  let qrUrl: string | null = null;
  let qrSvg: string | null = null;
  async function generateQrToken(label: string) {
    const res = await api('/api/admin/qr-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label })
    });
    if (!res.ok) return;
    const j = (await res.json()) as { url: string; qr: string };
    qrUrl = j.url;
    qrSvg = j.qr;
  }
</script>

<svelte:head><title>Photowall · Admin</title></svelte:head>

<header>
  <h1>Admin</h1>
  <form method="POST" action="/logout?which=admin">
    <button type="submit" class="ghost-tiny">sign out</button>
  </form>
</header>

<main>
  <section class="settings">
    <label class="slider">
      <span class="label">Wall cell size: <strong>{cellSize}px</strong></span>
      <input
        type="range"
        min="80"
        max="1000"
        step="20"
        bind:value={cellSize}
        on:input={onCellSizeInput}
      />
      <span class="hint">smaller = more photos on the wall · changes apply live</span>
    </label>
    <label class="slider">
      <span class="label">Max wall tiles: <strong>{maxCells}</strong></span>
      <input
        type="range"
        min="4"
        max="120"
        step="2"
        bind:value={maxCells}
        on:input={onMaxCellsInput}
      />
      <span class="hint">hard cap on rendered tiles · lower = better TV/laptop performance</span>
    </label>
  </section>

  <section class="settings">
    <div class="slider">
      <span class="label">Slideshow mode</span>
      <div class="mode-row">
        {#each ['off', 'on', 'auto'] as m (m)}
          <label class="mode-opt" class:active={slideshowMode === m}>
            <input
              type="radio"
              name="slideshow_mode"
              value={m}
              bind:group={slideshowMode}
              on:change={onSlideshowModeChange}
            />
            <span>{m === 'off' ? 'Off (mosaic)' : m === 'on' ? 'On (slideshow)' : 'Auto'}</span>
          </label>
        {/each}
      </div>
      <span class="hint">Off = wall mosaic · On = single-photo slideshow · Auto = alternates by timer</span>
    </div>

    <label class="slider">
      <span class="label">Seconds per slide: <strong>{slideshowSeconds}s</strong></span>
      <input
        type="range"
        min="3"
        max="30"
        step="1"
        bind:value={slideshowSeconds}
        on:input={onSlideshowSecondsInput}
      />
      <span class="hint">applies in On and Auto modes</span>
    </label>

    <div class="slider auto-cycle" class:dim={slideshowMode !== 'auto'}>
      <span class="label">Auto cycle</span>
      <div class="auto-row">
        <label>
          Mosaic for
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            bind:value={autoMosaicMin}
            on:input={onAutoMosaicInput}
          />
          min
        </label>
        <label>
          then slideshow for
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            bind:value={autoSlideshowMin}
            on:input={onAutoSlideshowInput}
          />
          min
        </label>
      </div>
      <span class="hint">used only when mode is set to Auto · wall-clock synced across all viewers</span>
    </div>
  </section>

  <section class="actions">
    <a href="/api/admin/download-all" class="primary">⬇ Download archive (zip of originals)</a>
    <button class="primary" on:click={() => generateQrToken('entrance')}>📱 Generate entrance QR</button>
  </section>

  {#if qrUrl}
    <section class="qr">
      <p>Scan or share this URL — anyone who opens it can sign in without the party password.</p>
      <p class="qr-url"><code>{qrUrl}</code></p>
      <div class="qr-svg">{@html qrSvg}</div>
      <p class="muted">Token expires in 14 days.</p>
    </section>
  {/if}

  <section class="filters">
    {#each [['all', 'All'], ['guest', 'Guest uploads'], ['sdcard', 'SD card'], ['hidden', 'Hidden']] as [key, label]}
      <button
        class:active={filter === key}
        on:click={() => (filter = key)}
      >
        {label}
      </button>
    {/each}
    <span class="count">{visiblePhotos.length} / {photos.length}</span>
  </section>

  <table>
    <thead>
      <tr>
        <th>Preview</th>
        <th>Uploader</th>
        <th>Source</th>
        <th>Uploaded</th>
        <th>Size</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each visiblePhotos as p (p.id)}
        <tr class:hidden-row={p.hiddenAt}>
          <td>
            <a href="/api/photos/{p.id}/file?v=original" target="_blank" rel="noopener">
              <img src="/api/photos/{p.id}/file?v=thumb" alt="" />
            </a>
          </td>
          <td>{p.uploaderLabel}</td>
          <td>{p.source}</td>
          <td>{new Date(p.uploadedAt).toLocaleString()}</td>
          <td>{p.width}×{p.height} · {(p.bytes / 1024).toFixed(0)} KB</td>
          <td>{p.hiddenAt ? 'hidden' : 'visible'}</td>
          <td class="row-actions">
            {#if p.hiddenAt}
              <button on:click={() => setHidden(p.id, false)} disabled={busy.has(p.id)}>
                unhide
              </button>
            {:else}
              <button on:click={() => setHidden(p.id, true)} disabled={busy.has(p.id)}>
                hide
              </button>
            {/if}
            <button class="danger" on:click={() => hardDelete(p.id)} disabled={busy.has(p.id)}>
              delete
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  header h1 {
    margin: 0;
    font-size: 1.25rem;
  }
  .ghost-tiny {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
  }
  main {
    padding: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .settings {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .slider .label {
    font-size: 0.95rem;
  }
  .slider input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .slider .hint {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .settings .slider + .slider,
  .settings .slider + .auto-cycle {
    margin-top: 1.25rem;
  }
  .mode-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .mode-opt {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.4rem 0.85rem;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .mode-opt input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .mode-opt.active {
    background: rgba(255, 79, 139, 0.15);
    border-color: var(--accent);
    color: #fff;
  }
  .auto-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
    font-size: 0.9rem;
  }
  .auto-row label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--fg);
  }
  .auto-row input[type='number'] {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 0.4rem;
    padding: 0.3rem 0.5rem;
    width: 4.5rem;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }
  .auto-cycle.dim {
    opacity: 0.55;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.6rem 1rem;
    text-decoration: none;
    font-weight: 600;
    cursor: pointer;
  }
  .qr {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin: 1rem 0;
    text-align: center;
  }
  .qr-url code {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.3rem 0.5rem;
    border-radius: 0.3rem;
    font-size: 0.85rem;
    word-break: break-all;
  }
  .qr-svg :global(svg) {
    width: 220px;
    height: 220px;
    background: #fff;
    border-radius: 0.5rem;
    padding: 0.5rem;
    margin: 0.75rem auto;
    display: block;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .filters {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 1rem 0;
    flex-wrap: wrap;
  }
  .filters button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    font-size: 0.85rem;
  }
  .filters button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .filters .count {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.85rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  th {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td img {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 0.3rem;
    display: block;
  }
  .hidden-row {
    opacity: 0.5;
  }
  .row-actions {
    display: flex;
    gap: 0.4rem;
  }
  .row-actions button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 0.3rem;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
  }
  .row-actions button.danger {
    border-color: #ff5050;
    color: #ff7a7a;
  }
</style>
