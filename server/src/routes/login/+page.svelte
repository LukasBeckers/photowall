<script lang="ts">
  import type { ActionData, PageData } from './$types';
  export let data: PageData;
  export let form: ActionData;
</script>

<svelte:head><title>Photowall · Sign in</title></svelte:head>

<main>
  <h1>Photowall</h1>
  {#if data.hasToken}
    <p class="muted">QR token recognized. Just pick a display name.</p>
  {:else}
    <p class="muted">Enter the party password.</p>
  {/if}

  <form method="POST">
    <input type="hidden" name="next" value={data.next} />

    {#if !data.hasToken}
      <label>
        <span>Party password</span>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          required
        />
      </label>
    {/if}

    <label>
      <span>Your name</span>
      <input
        type="text"
        name="display_name"
        autocomplete="nickname"
        maxlength="40"
        value={form?.displayName ?? ''}
        required
        autofocus
      />
    </label>

    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}

    <button type="submit">Continue</button>
  </form>
</main>

<style>
  main {
    max-width: 360px;
    margin: 4rem auto;
    padding: 1.5rem;
    text-align: center;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 2.25rem;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .muted {
    color: var(--muted);
    margin: 0 0 1.5rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    text-align: left;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
  }
  button {
    margin-top: 0.5rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.7rem 1rem;
    font-size: 1rem;
    font-weight: 600;
  }
  button:hover {
    filter: brightness(1.1);
  }
  .error {
    color: #ff7373;
    margin: 0;
    font-size: 0.9rem;
  }
</style>
