<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let deletingFile: string | null = null;
  let confirmDelete: string | null = null;

  function handleDeleteClick(filePath: string) {
    if (confirmDelete === filePath) {
      confirmDelete = null;
    } else {
      confirmDelete = filePath;
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getFileExtension(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || '';
  }

  function getFileIcon(filename: string) {
    const ext = getFileExtension(filename);
    const icons: Record<string, string> = {
      pdf: '📄',
      txt: '📝',
      doc: '📘',
      docx: '📘',
      json: '📋',
      md: '📝',
    };
    return icons[ext] || '📎';
  }

  // Grouper les fichiers par jeu
  $: filesByGame = data.files.reduce(
    (acc: Record<string, typeof data.files>, file) => {
      if (!acc[file.game]) {
        acc[file.game] = [];
      }
      acc[file.game].push(file);
      return acc;
    },
    {} as Record<string, typeof data.files>
  );
</script>

<svelte:head>
  <title>Gestion des Fichiers - Admin</title>
</svelte:head>

<div class="page-header">
  <div>
    <h1>📁 Gestion des Fichiers</h1>
    <p class="summary">
      {data.stats.totalFiles} fichier(s) • {formatFileSize(data.stats.totalSize)} • {data.stats
        .gamesCount}
      jeu(x)
    </p>
  </div>
</div>

{#if form?.success}
  <div class="alert alert-success">✅ {form.message}</div>
{/if}

{#if form?.error}
  <div class="alert alert-error">❌ {form.error}</div>
{/if}

{#if data.files.length === 0}
  <div class="empty-state">
    <p>Aucun fichier uploadé pour le moment.</p>
    <a href="/import" class="btn btn-primary">Importer des règles</a>
  </div>
{:else}
  <div class="games-section">
    {#each Object.entries(filesByGame) as [game, files]}
      <div class="game-group">
        <h2 class="game-title">
          🎮 {game}
          <span class="file-count">{files.length} fichier(s)</span>
        </h2>

        <div class="files-list">
          {#each files as file}
            <div class="file-card">
              <div class="file-icon">{getFileIcon(file.name)}</div>

              <div class="file-info">
                <div class="file-name">{file.name}</div>
                <div class="file-meta">
                  <span>{formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span>{formatDate(file.modified)}</span>
                </div>
                <div class="file-path">{file.relativePath}</div>
              </div>

              <div class="file-actions">
                <a href="/files/{file.relativePath}" class="btn btn-view" target="_blank">
                  👁️ Voir
                </a>

                <form
                  method="POST"
                  action="?/delete"
                  use:enhance={() => {
                    deletingFile = file.path;
                    return async ({ update }) => {
                      await update();
                      deletingFile = null;
                      confirmDelete = null;
                    };
                  }}
                >
                  <input type="hidden" name="filePath" value={file.path} />
                  {#if confirmDelete === file.path}
                    <button
                      type="submit"
                      class="btn btn-danger-sm"
                      disabled={deletingFile === file.path}
                    >
                      {deletingFile === file.path ? '...' : 'Confirmer'}
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary-sm"
                      on:click={() => (confirmDelete = null)}
                    >
                      Annuler
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="btn btn-delete"
                      on:click={() => handleDeleteClick(file.path)}
                    >
                      🗑️
                    </button>
                  {/if}
                </form>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .page-header {
    margin-bottom: 2rem;
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

  .empty-state {
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

  .games-section {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .game-group {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .game-title {
    font-size: 1.25rem;
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #f0f0f0;
  }

  .file-count {
    font-size: 0.875rem;
    color: #666;
    font-weight: normal;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .file-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .file-card:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .file-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 0.25rem;
    word-break: break-all;
  }

  .file-meta {
    font-size: 0.875rem;
    color: #666;
    display: flex;
    gap: 0.5rem;
  }

  .file-path {
    font-size: 0.75rem;
    color: #999;
    font-family: monospace;
    margin-top: 0.25rem;
  }

  .file-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
  }

  .file-actions form {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: none;
    font-size: 0.875rem;
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

  .btn-view {
    background: #3b82f6;
    color: white;
  }

  .btn-view:hover {
    background: #2563eb;
  }

  .btn-delete {
    background: transparent;
    color: #dc2626;
    border: 1px solid #dc2626;
    padding: 0.5rem 0.75rem;
  }

  .btn-delete:hover {
    background: #dc2626;
    color: white;
  }

  .btn-danger-sm {
    background: #dc2626;
    color: white;
    padding: 0.5rem 0.75rem;
  }

  .btn-danger-sm:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-danger-sm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary-sm {
    background: #6b7280;
    color: white;
    padding: 0.5rem 0.75rem;
  }

  .btn-secondary-sm:hover {
    background: #4b5563;
  }

  @media (max-width: 768px) {
    .file-card {
      flex-direction: column;
      align-items: start;
    }

    .file-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
