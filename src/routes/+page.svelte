<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let isLoading = false;
</script>

<svelte:head>
  <title>Ask Rules — Règles de jeu de société</title>
  <meta
    name="description"
    content="Posez des questions sur vos règles de jeu indexées."
  />
</svelte:head>

<div class="page">
  <!-- En-tête -->
  <header class="header">
    <h1 class="logo">Ask Rules</h1>
    <p class="tagline">Posez une question sur vos règles de jeu de société</p>
  </header>

  <!-- Formulaire -->
  <form
    method="POST"
    class="ask-form"
    use:enhance={() => {
      isLoading = true;
      return async ({ update }) => {
        await update();
        isLoading = false;
      };
    }}
  >
    <textarea
      name="question"
      class="question-input"
      placeholder="Ex : Comment se déroule un combat ? Combien de joueurs ?"
      required
      rows="3"
      disabled={isLoading}
      autofocus
    ></textarea>

    <div class="form-footer">
      {#if data.games.length > 1}
        <select name="jeu" class="game-select" disabled={isLoading}>
          <option value="">Sélection automatique</option>
          {#each data.games as g}
            <option value={g.jeu}>{g.jeu}</option>
          {/each}
        </select>
      {:else if data.games.length === 1}
        <span class="game-label">🎲 {data.games[0].jeu}</span>
      {:else}
        <span class="game-label empty">Aucun jeu indexé</span>
      {/if}

      <button
        type="submit"
        class="submit-btn{isLoading ? ' loading' : ''}"
        disabled={isLoading || data.games.length === 0}
      >
        {#if isLoading}
          <span class="spinner" aria-hidden="true"></span>Recherche…
        {:else}
          Poser la question →
        {/if}
      </button>
    </div>
  </form>

  <!-- Résultats -->
  {#if form}
    <section class="result-section" aria-live="polite">
      {#if !form.ok}
        <div class="error-card" role="alert">
          <span class="error-icon">⚠</span>
          {form.error}
        </div>
      {:else}
        <!-- Jeu sélectionné -->
        <div class="game-badge">
          <span class="game-icon">🎲</span>
          <span>{form.jeu}</span>
          {#if form.matchedName}<span class="badge-tag">mentionné</span>{/if}
        </div>

        <!-- Réponse LLM -->
        <div class="answer-card">
          {#if form.used_llm}
            <div class="answer-header">
              Réponse
              <span class="model-tag">{form.model}</span>
            </div>
            <p class="answer-text">{form.answer}</p>
          {:else}
            <p class="no-llm-notice">
              Aucun LLM configuré. Ajoutez <code>MISTRAL_API_KEY</code>,
              <code>OPENAI_API_KEY</code> ou <code>OLLAMA_MODEL</code> dans
              <code>.env</code>.
            </p>
          {/if}
        </div>

        <!-- Sections source -->
        <details class="sources-details">
          <summary class="sources-summary">
            {form.sections.length} section{form.sections.length > 1 ? 's' : ''} source
          </summary>
          <div class="sources-list">
            {#each form.sections as s}
              <div class="source-card">
                <div class="source-header">
                  <span class="source-title">{s.titre}</span>
                  <div class="source-meta">
                    {#if s.page_debut}
                      <span class="source-page">
                        p.{s.page_debut}{s.page_fin && s.page_fin !== s.page_debut ? `–${s.page_fin}` : ''}
                      </span>
                    {/if}
                    <span class="source-score">{(s.score * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <p class="source-text">
                  {s.resume || s.contenu.slice(0, 220) + '…'}
                </p>
              </div>
            {/each}
          </div>
        </details>
      {/if}
    </section>
  {/if}

  <!-- Footer -->
  <footer class="footer">
    {#if data.games.length > 0}
      <span
        >{data.games.length} jeu{data.games.length > 1 ? 'x' : ''} indexé{data
          .games.length > 1
          ? 's'
          : ''}</span
      >
    {/if}
  </footer>
</div>
