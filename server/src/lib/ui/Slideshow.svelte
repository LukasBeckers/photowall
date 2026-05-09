<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isVideo } from '$lib/types';
  import type { PhotoSummary } from '$lib/types';

  // The full pool from the wall page — slideshow walks through all of them.
  export let items: { photo: PhotoSummary; key: number }[] = [];
  export let seconds = 6;

  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let videoEl: HTMLVideoElement | null = null;

  $: current = items.length > 0 ? items[Math.min(index, items.length - 1)] : null;

  $: if (videoEl && current) videoEl.playbackRate = current.photo.speed || 1;

  function advance() {
    if (items.length === 0) return;
    index = (index + 1) % items.length;
  }

  function restartTimer(intervalSeconds: number) {
    if (timer) clearInterval(timer);
    if (intervalSeconds > 0) {
      timer = setInterval(advance, intervalSeconds * 1000);
    }
  }

  // Restart the interval whenever the configured seconds changes.
  $: restartTimer(seconds);

  onMount(() => {
    restartTimer(seconds);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="slideshow">
  {#if current}
    {#key current.key}
      <div class="slide">
        {#if isVideo(current.photo)}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video
            bind:this={videoEl}
            src={current.photo.wallVideo ?? current.photo.original}
            poster={current.photo.wall}
            autoplay
            loop
            muted
            playsinline
            preload="auto"
          ></video>
        {:else}
          <img src={current.photo.wall} alt="" />
        {/if}
        {#if current.photo.uploader}
          <div class="who">{current.photo.uploader}</div>
        {/if}
      </div>
    {/key}
  {:else}
    <p class="empty">Waiting for photos…</p>
  {/if}
</div>

<style>
  .slideshow {
    flex: 1;
    /* min-height: 0 is critical inside a flex column — without it, percentage
       heights on descendants (like the slide / image) don't resolve and the
       image renders at intrinsic size, clipping against `overflow: hidden`.
       This was cropping tall portrait photos from the top before. */
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: #000;
  }
  .slide {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Brief opacity fade between slides — opacity-only is GPU-cheap and
       doesn't force per-frame repaint of the video like transform would. */
    animation: fadein 200ms ease-out;
  }
  @keyframes fadein {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .slide img,
  .slide video {
    /* Fill the slot, then contain the actual content within those bounds.
       This is the canonical aspect-preserving fit; works for any aspect
       ratio (portrait phone photos, landscape clips, square) without
       cropping or distorting. */
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .who {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    font-size: 1.1rem;
    backdrop-filter: blur(4px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    max-width: calc(100% - 2rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: rgba(255, 255, 255, 0.5);
    font-size: 1.2rem;
  }
</style>
