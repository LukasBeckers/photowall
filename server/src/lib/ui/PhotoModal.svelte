<script lang="ts">
  import type { PhotoSummary } from '$lib/types';
  import { REACTION_EMOJI } from '$lib/emoji';
  import { createEventDispatcher } from 'svelte';

  export let photo: PhotoSummary;
  export let myReactions: Set<string> = new Set();

  const dispatch = createEventDispatcher<{
    close: void;
    react: { emoji: string; on: boolean };
  }>();

  function close() {
    dispatch('close');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function toggle(emoji: string) {
    const on = !myReactions.has(emoji);
    dispatch('react', { emoji, on });
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="backdrop"
  on:click|self={close}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="modal">
    <button class="close" on:click={close} aria-label="Close">×</button>

    <img src={photo.wall} alt="" />

    <div class="meta">
      <span class="uploader">{photo.uploader}</span>
      <a class="download" href="{photo.original}&download=1" download>
        Download original
      </a>
    </div>

    <div class="reactions">
      {#each REACTION_EMOJI as emoji}
        <button
          class="reaction"
          class:active={myReactions.has(emoji)}
          on:click={() => toggle(emoji)}
        >
          <span class="e">{emoji}</span>
          <span class="n">{photo.reactions[emoji] ?? 0}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: grid;
    place-items: center;
    z-index: 50;
    padding: 1rem;
  }
  .modal {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 1rem;
    max-width: min(95vw, 1024px);
    max-height: 95vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: #fff;
    font-size: 1.5rem;
    line-height: 1;
    z-index: 1;
  }
  img {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    background: #000;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
  }
  .uploader {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .download {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .reactions {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem 1rem;
    flex-wrap: wrap;
    border-top: 1px solid var(--border);
  }
  .reaction {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.4rem 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 1rem;
    color: var(--fg);
    transition: transform 0.1s ease, background 0.15s ease;
  }
  .reaction:active {
    transform: scale(0.95);
  }
  .reaction.active {
    background: rgba(255, 79, 139, 0.15);
    border-color: var(--accent);
  }
  .e {
    font-size: 1.2rem;
  }
  .n {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    min-width: 1ch;
    text-align: center;
  }
</style>
