<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import SEO from '$lib/SEO.svelte';

  export let data: PageData;
  export let form: ActionData;

  let deletingGame: string | null = null;
  let confirmDelete: string | null = null;

  function handleDeleteClick(gameId: string) {
    if (confirmDelete === gameId) {
      confirmDelete = null;
    } else {
      confirmDelete = gameId;
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'Date inconnue';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatFileSize(bytes: number | undefined) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
</script>

<SEO title="Gestion des Jeux - Admin" description="Interface d'administration des jeux" />

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page-header">
  <div>
    <h1>🎮 Gestion des Jeux</h1>
    <p class="summary">{data.summary}</p>
  </div>
  <a href="/import" class="btn btn-primary">+ Importer un jeu</a>
</div>

{#if form?.success}
  <div class="alert alert-success">✅ {form.message}</div>
{/if}

{#if form?.error}
  <div class="alert alert-error">❌ {form.error}</div>
{/if}

<div class="games-grid">
  {#each data.games as game}
    <div class="game-card">
      <div class="game-header">
        <h2>{game.jeu}</h2>
        <span class="badge">{game.sectionsCount} sections</span>
      </div>

      <div class="game-info">
        <div class="info-row">
          <span class="label">ID:</span>
          <code class="value">{game.id}</code>
        </div>
        <div class="info-row">
          <span class="label">Fichier:</span>
          <span class="value file-name">{game.fichier}</span>
        </div>
        <div class="info-row">
          <span class="label">Date d'ajout:</span>
          <span class="value">{formatDate(game.date_ajout)}</span>
        </div>
        {#if game.statistiques?.pageCount}
          <div class="info-row">
            <span class="label">Pages:</span>
            <span class="value">{game.statistiques.pageCount}</span>
          </div>
        {/if}
        {#if game.statistiques?.fileSize}
          <div class="info-row">
            <span class="label">Taille:</span>
            <span class="value">{formatFileSize(game.statistiques.fileSize)}</span>
          </div>
        {/if}
        {#if game.metadata?.mecaniques?.length}
          <div class="info-row mecaniques">
            <span class="label">Mécaniques:</span>
            <div class="mecaniques-list">
              {#each game.metadata.mecaniques.slice(0, 5) as mecanique}
                <span class="mecanique-tag">{mecanique}</span>
              {/each}
              {#if game.metadata.mecaniques.length > 5}
                <span class="mecanique-tag more">+{game.metadata.mecaniques.length - 5}</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="game-actions">
        <form
          method="POST"
          action="?/delete"
          use:enhance={() => {
            deletingGame = game.id;
            return async ({ update }) => {
              await update();
              deletingGame = null;
              confirmDelete = null;
            };
          }}
        >
          <input type="hidden" name="gameId" value={game.id} />
          {#if confirmDelete === game.id}
            <button type="submit" class="btn btn-danger" disabled={deletingGame === game.id}>
              {deletingGame === game.id ? 'Suppression...' : 'Confirmer'}
            </button>
            <button type="button" class="btn btn-secondary" on:click={() => (confirmDelete = null)}>
              Annuler
            </button>
          {:else}
            <button
              type="button"
              class="btn btn-danger-outline"
              on:click={() => handleDeleteClick(game.id)}
            >
              🗑️ Supprimer
            </button>
          {/if}
        </form>
      </div>
    </div>
  {/each}

  {#if data.games.length === 0}
    <div class="empty-state">
      <p>Aucun jeu dans la base de données.</p>
      <a href="/import" class="btn btn-primary">Importer des règles</a>
    </div>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 2rem;
    gap: 1rem;
  }

  h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .summary {
    color: #666;
    font-size: 1rem;
  }

  .alert {
    padding: 1rem;
    margin-bottom: 1.5rem;
    border-radius: 8px;
    font-weight: 500;
  }

  .alert-success {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  .alert-error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .games-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .game-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: box-shadow 0.2s;
  }

  .game-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .game-header h2 {
    font-size: 1.25rem;
    color: #1a1a1a;
    margin: 0;
    flex: 1;
  }

  .badge {
    background: #4f46e5;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .game-info {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .info-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .info-row.mecaniques {
    flex-direction: column;
  }

  .label {
    font-weight: 600;
    color: #555;
    min-width: 90px;
  }

  .value {
    color: #333;
    flex: 1;
  }

  .value code {
    background: #f5f5f5;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .file-name {
    word-break: break-all;
  }

  .mecaniques-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .mecanique-tag {
    background: #f0f0f0;
    color: #444;
    padding: 0.25rem 0.625rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .mecanique-tag.more {
    background: #e0e0e0;
    font-weight: 600;
  }

  .game-actions {
    padding-top: 1rem;
    border-top: 1px solid #f0f0f0;
  }

  .game-actions form {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    border: none;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-block;
  }

  .btn-primary {
    background: #4f46e5;
    color: white;
  }

  .btn-primary:hover {
    background: #4338ca;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-danger:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }

  .btn-danger-outline {
    background: transparent;
    color: #dc2626;
    border: 2px solid #dc2626;
  }

  .btn-danger-outline:hover {
    background: #dc2626;
    color: white;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 4rem 2rem;
    background: white;
    border-radius: 12px;
    border: 2px dashed #d1d5db;
  }

  .empty-state p {
    font-size: 1.125rem;
    color: #6b7280;
    margin-bottom: 1.5rem;
  }
</style>
