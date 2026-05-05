<script lang="ts">
  import type { ActionData, PageData } from './$types';
  export let data: PageData;
  export let form: ActionData;
</script>

<svelte:head><title>Photowall · Admin sign in</title></svelte:head>

<main>
  <h1>Admin</h1>
  <form method="POST">
    <input type="hidden" name="next" value={data.next} />
    <label>
      <span>Admin password</span>
      <input type="password" name="password" autocomplete="current-password" required autofocus />
    </label>
    {#if form?.error}<p class="error">{form.error}</p>{/if}
    <button type="submit">Sign in</button>
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
    margin: 0 0 1.25rem;
    font-size: 1.75rem;
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
  button {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.7rem 1rem;
    font-weight: 600;
  }
  .error {
    color: #ff7373;
    margin: 0;
    font-size: 0.9rem;
  }
</style>
