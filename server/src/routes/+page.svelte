<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';
  import type { PhotoSummary, PhotoListResponse } from '$lib/types';
  import { REACTION_EMOJI } from '$lib/emoji';
  import { isVideo } from '$lib/types';
  import PhotoModal from '$lib/ui/PhotoModal.svelte';

  export let data: PageData;

  let photos: PhotoSummary[] = [];
  let nextBefore: string | null = null;
  let loading = false;
  let openPhoto: PhotoSummary | null = null;
  let myReactions: Map<string, Set<string>> = new Map(); // photoId -> emojis
  const MAX_BYTES = 200 * 1024 * 1024;

  let pendingUploads: Array<{
    key: string;
    name: string;
    status: 'uploading' | 'error';
    error?: string;
    previewUrl?: string;
  }> = [];
  let es: EventSource | null = null;

  // Helper: replace a photo's reactions inside `photos` and (if open) `openPhoto`.
  // Uses immutable updates so Svelte's prop comparison detects the change.
  function applyCounts(photoId: string, counts: Record<string, number>) {
    photos = photos.map((p) => (p.id === photoId ? { ...p, reactions: counts } : p));
    if (openPhoto?.id === photoId) openPhoto = { ...openPhoto, reactions: counts };
  }

  function setMyReaction(photoId: string, emoji: string, on: boolean) {
    const prev = myReactions.get(photoId) ?? new Set<string>();
    const next = new Set(prev);
    if (on) next.add(emoji);
    else next.delete(emoji);
    // New Map identity so reactive subscribers refresh; new Set identity so the
    // PhotoModal prop comparison sees a fresh value.
    myReactions = new Map(myReactions).set(photoId, next);
  }

  async function loadPage(before?: string | null) {
    if (loading) return;
    loading = true;
    try {
      const url = new URL('/api/photos', window.location.origin);
      if (before) url.searchParams.set('before', before);
      const res = await fetch(url);
      if (!res.ok) throw new Error('list failed');
      const data = (await res.json()) as PhotoListResponse;
      photos = before ? [...photos, ...data.photos] : data.photos;
      nextBefore = data.nextBefore;
      await refreshMyReactions(data.photos.map((p) => p.id));
    } finally {
      loading = false;
    }
  }

  async function refreshMyReactions(ids: string[]) {
    if (ids.length === 0) return;
    const res = await fetch('/api/me/reactions?ids=' + ids.join(','));
    if (!res.ok) return;
    const json = (await res.json()) as { reactions: Record<string, string[]> };
    const next = new Map(myReactions);
    for (const [pid, list] of Object.entries(json.reactions)) {
      next.set(pid, new Set(list));
    }
    myReactions = next;
  }

  async function handleFiles(input: HTMLInputElement) {
    const all = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same file
    if (all.length === 0) return;

    // Client-side size check so we don't waste a 200 MB upload on a clip
    // we already know we'll reject. Track each file with its own preview entry.
    const tempEntries = all.map((f) => {
      let error: string | undefined;
      if (f.size > MAX_BYTES) {
        error = `Too large (${(f.size / 1024 / 1024).toFixed(0)} MB; max 200 MB)`;
      } else if (f.size === 0) {
        error = 'Empty file';
      }
      return {
        file: f,
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        name: f.name,
        status: error ? ('error' as const) : ('uploading' as const),
        error,
        previewUrl: URL.createObjectURL(f)
      };
    });
    pendingUploads = [...tempEntries.map(({ file: _, ...rest }) => rest), ...pendingUploads];

    const ok = tempEntries.filter((e) => !e.error);
    if (ok.length === 0) return; // nothing to send; rejected entries stay visible

    const fd = new FormData();
    for (const e of ok) fd.append('files', e.file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });

      if (!res.ok) {
        // Try to read the server's error text so we can show it.
        let detail = `HTTP ${res.status}`;
        try {
          const text = await res.text();
          if (text) {
            try {
              const j = JSON.parse(text);
              detail = j.message ?? j.error ?? detail;
            } catch {
              detail = text.slice(0, 200);
            }
          }
        } catch {
          /* ignore */
        }
        markErrors(tempEntries, () => detail);
        return;
      }

      const body = (await res.json()) as {
        uploaded: Array<{ id: string; duplicate: boolean; name: string }>;
        errors: Array<{ name: string; error: string }>;
      };
      // Per-file errors come back in body.errors. Map them to the right entries.
      const errMap = new Map(body.errors.map((e) => [e.name, e.error]));
      for (const t of tempEntries) {
        if (t.error) continue; // already rejected client-side
        const e = errMap.get(t.name);
        if (e) {
          t.status = 'error';
          t.error = e;
        }
      }
      // Drop entries that succeeded; keep failures visible.
      const succeeded = new Set(
        tempEntries
          .filter((t) => t.status !== 'error' && !errMap.has(t.name))
          .map((t) => t.key)
      );
      pendingUploads = pendingUploads.map((p) => {
        const match = tempEntries.find((t) => t.key === p.key);
        if (!match) return p;
        return { ...p, status: match.status, error: match.error };
      });
      pendingUploads = pendingUploads.filter((p) => !succeeded.has(p.key));
      for (const t of tempEntries) {
        if (succeeded.has(t.key) && t.previewUrl) URL.revokeObjectURL(t.previewUrl);
      }
      await loadPage();
    } catch (e) {
      // Network failure / disconnect / browser timeout
      const msg = (e as Error).message || 'Network error';
      markErrors(tempEntries, () => msg);
    }
  }

  function markErrors(
    tempEntries: Array<{ key: string; status: 'uploading' | 'error'; error?: string }>,
    msg: (entry: { key: string; status: 'uploading' | 'error' }) => string
  ) {
    pendingUploads = pendingUploads.map((p) => {
      const t = tempEntries.find((x) => x.key === p.key);
      if (!t) return p;
      // Don't overwrite a client-side rejection (e.g. "too large") with a
      // generic network error.
      if (t.status === 'error' && t.error) return { ...p, status: 'error', error: t.error };
      return { ...p, status: 'error', error: msg(t) };
    });
  }

  async function react(photo: PhotoSummary, emoji: string, on: boolean) {
    // Save originals so we can revert if the request fails.
    const originalCounts = photo.reactions;

    setMyReaction(photo.id, emoji, on);

    // Optimistic count update.
    const optimistic = { ...originalCounts };
    optimistic[emoji] = (optimistic[emoji] ?? 0) + (on ? 1 : -1);
    if (optimistic[emoji] <= 0) delete optimistic[emoji];
    applyCounts(photo.id, optimistic);

    try {
      const res = await fetch(`/api/photos/${photo.id}/react`, {
        method: on ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji })
      });
      if (!res.ok) throw new Error('react failed');
      const j = (await res.json()) as { photoId: string; counts: Record<string, number> };
      // Server is authoritative — accept its counts even if they differ.
      applyCounts(photo.id, j.counts);
    } catch {
      // Revert on failure.
      setMyReaction(photo.id, emoji, !on);
      applyCounts(photo.id, originalCounts);
    }
  }

  function onScroll() {
    if (!nextBefore || loading) return;
    const remaining =
      document.documentElement.scrollHeight -
      window.scrollY -
      window.innerHeight;
    if (remaining < 800) loadPage(nextBefore);
  }

  onMount(() => {
    loadPage();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Live updates from the server: other guests' uploads + everyone's
    // reactions. Our own reactions also come back through here as a
    // confirmation, which is harmless because applyCounts is idempotent.
    es = new EventSource('/api/sse');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'reaction.changed') {
          applyCounts(msg.photoId, msg.counts);
        } else if (msg.type === 'photo.added') {
          // Avoid duplicating photos we already have (e.g. our own upload).
          if (!photos.some((p) => p.id === msg.photo.id)) {
            photos = [msg.photo, ...photos];
          }
        } else if (msg.type === 'photo.hidden') {
          photos = photos.filter((p) => p.id !== msg.photoId);
          if (openPhoto?.id === msg.photoId) openPhoto = null;
        }
      } catch {
        /* ignore */
      }
    };
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onScroll);
    }
    if (es) es.close();
  });

  $: openMine = openPhoto ? myReactions.get(openPhoto.id) ?? new Set<string>() : new Set<string>();
</script>

<svelte:head><title>Photowall</title></svelte:head>

<header>
  <div class="brand">photowall</div>
  <div class="who">
    <span class="muted">Hi {data.displayName}</span>
    <form method="POST" action="/logout" class="signout">
      <button type="submit" class="ghost-tiny">sign out</button>
    </form>
  </div>
</header>

<main>
  <label class="add-btn">
    <input
      type="file"
      accept="image/*,video/*"
      multiple
      on:change={(e) => handleFiles(e.currentTarget)}
    />
    <span>＋ Add photos</span>
  </label>

  <div class="grid">
    {#each pendingUploads as p (p.key)}
      <div class="card pending" class:errored={p.status === 'error'}>
        {#if p.previewUrl}<img src={p.previewUrl} alt="" />{/if}
        <div class="overlay">
          {#if p.status === 'uploading'}
            uploading…
          {:else}
            <span class="err-name">{p.name}</span>
            <span class="err-msg">{p.error ?? 'failed'}</span>
          {/if}
        </div>
      </div>
    {/each}

    {#each photos as photo (photo.id)}
      <button class="card" on:click={() => (openPhoto = photo)}>
        <img src={photo.thumb} alt="" loading="lazy" />
        {#if isVideo(photo)}
          <span class="play-badge" aria-hidden="true">▶</span>
        {/if}
        <div class="card-meta">
          <span class="who-tag">{photo.uploader}</span>
          <span class="counts">
            {#each REACTION_EMOJI as emoji}
              {#if photo.reactions[emoji]}
                <span class="count">{emoji}{photo.reactions[emoji]}</span>
              {/if}
            {/each}
          </span>
        </div>
      </button>
    {/each}
  </div>

  {#if !loading && photos.length === 0 && pendingUploads.length === 0}
    <p class="empty">No photos yet. Tap "Add photos" to start.</p>
  {/if}
  {#if loading}
    <p class="empty">Loading…</p>
  {/if}

  <p class="footer">
    <a href="/wall">Open the TV wall →</a>
  </p>
</main>

{#if openPhoto}
  <PhotoModal
    photo={openPhoto}
    myReactions={openMine}
    on:close={() => (openPhoto = null)}
    on:react={(e) => openPhoto && react(openPhoto, e.detail.emoji, e.detail.on)}
  />
{/if}

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: rgba(10, 10, 10, 0.92);
    backdrop-filter: blur(8px);
    z-index: 10;
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.05em;
    font-size: 0.95rem;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
  }
  .signout {
    margin: 0;
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
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .add-btn {
    display: block;
    margin: 0.25rem 0 1rem;
    cursor: pointer;
  }
  .add-btn input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .add-btn span {
    display: block;
    background: var(--accent);
    color: #fff;
    text-align: center;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(255, 79, 139, 0.25);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .card {
    position: relative;
    aspect-ratio: 1 / 1;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    overflow: hidden;
    padding: 0;
    cursor: pointer;
  }
  .card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .play-badge {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 1rem;
    line-height: 1;
    display: grid;
    place-items: center;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .card-meta {
    position: absolute;
    inset: auto 0 0 0;
    padding: 0.4rem 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 0.25rem;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
    font-size: 0.7rem;
  }
  .who-tag {
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }
  .counts {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .count {
    background: rgba(0, 0, 0, 0.6);
    padding: 1px 5px;
    border-radius: 999px;
    color: #fff;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .pending {
    opacity: 0.65;
  }
  .pending.errored {
    border-color: #ff5050;
  }
  .pending .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 0.75rem;
    padding: 0.4rem;
    text-align: center;
  }
  .err-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .err-msg {
    color: #ffb0b0;
    font-size: 0.7rem;
  }

  .empty {
    text-align: center;
    color: var(--muted);
    padding: 2rem 1rem;
  }
  .footer {
    text-align: center;
    margin-top: 2rem;
    padding-bottom: 2rem;
  }
</style>
