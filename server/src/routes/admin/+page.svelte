<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  let photos = data.photos;
  let filter: 'all' | 'guest' | 'sdcard' | 'hidden' = 'all';
  let busy: Set<string> = new Set();
  let cellSize = data.cellSize;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function onCellSizeInput() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'wall_cell_size', value: cellSize })
      });
    }, 200);
  }

  $: visiblePhotos = photos.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'hidden') return p.hiddenAt !== null;
    return p.source === filter;
  });

  async function setHidden(id: string, hide: boolean) {
    busy.add(id);
    busy = busy;
    try {
      const res = await fetch(`/api/admin/photos/${id}`, {
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
      const res = await fetch(`/api/admin/photos/${id}`, { method: 'DELETE' });
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
    const res = await fetch('/api/admin/qr-token', {
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
