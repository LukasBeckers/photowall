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
      </div>
    {/key}
  {:else}
    <p class="empty">Waiting for photos…</p>
  {/if}
</div>

<style>
  .slideshow {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #000;
    display: grid;
    place-items: center;
  }
  .slide {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
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
    max-width: 100vw;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
  .empty {
    color: rgba(255, 255, 255, 0.5);
    font-size: 1.2rem;
  }
</style>
