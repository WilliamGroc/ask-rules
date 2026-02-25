<script>
  import '../app.css';
  import { page } from '$app/stores';
</script>

<nav class="nav">
  <a href="/" class="nav-brand">Ask Rules</a>
  <div class="nav-links">
    <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>Poser une question</a>
    <a href="/import" class="nav-link" class:active={$page.url.pathname === '/import'}
      >Importer des règles</a
    >
  </div>
</nav>

<slot />
