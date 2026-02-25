<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import type { GameSectionType } from '../types';
  import SEO from '$lib/SEO.svelte';

  export let data: PageData;
  export let form:
    | {
        ok: true;
        jeu: string;
        jeu_id: number;
        matchedName: boolean;
        answer: string;
        used_llm: boolean;
        model: string;
        fichier: string | null;
        sections: Array<{
          titre: string;
          type_section: GameSectionType;
          resume: string;
          contenu: string;
          score: number;
          page_debut: number | null;
          page_fin: number | null;
        }>;
      }
    | {
        ok: false;
        error: string;
      }
    | null;

  let isLoading = false;
  let selectedGame = '';
  let lastQuestion = '';
  let formEl: HTMLFormElement;

  const suggestedQuestions = [
    'Comment jouer ?',
    'Comment gagner ?',
    'Comment se déroule un tour ?',
    'Comment se déroule un combat ?',
    'Quelle est la mise en place ?',
    'Quelles sont les actions disponibles ?',
  ];

  function handleTextareaKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  }

  function fillQuestion(question: string) {
    const textarea = formEl.querySelector('textarea[name="question"]') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = question;
      textarea.focus();
    }
  }
</script>

<SEO
  title="Ask Rules — Assistant IA pour règles de jeux de société"
  description="Posez des questions sur vos jeux de société préférés et obtenez des réponses instantanées grâce à notre IA. Recherche intelligente dans les règles de vos jeux."
  keywords="jeux de société, règles de jeu, IA, assistant intelligent, board games, questions réponses, recherche règles, aide jeu de société"
/>

<div class="page">
  <!-- En-tête -->
  <header class="header">
    <h1 class="logo">Ask Rules</h1>
    <p class="tagline">Posez une question sur vos règles de jeu de société</p>
  </header>

  <!-- Formulaire -->
  <form
    bind:this={formEl}
    method="POST"
    class="ask-form"
    use:enhance={() => {
      isLoading = true;
      const savedGame = selectedGame;
      const textarea = formEl.querySelector('textarea[name="question"]') as HTMLTextAreaElement;
      const savedQuestion = textarea?.value ?? '';
      return async ({ update }) => {
        await update();
        selectedGame = savedGame;
        lastQuestion = savedQuestion;
        isLoading = false;
      };
    }}
  >
    <div class="suggested-tags">
      {#each suggestedQuestions as question}
        <button
          type="button"
          class="tag-btn"
          on:click={() => fillQuestion(question)}
          disabled={isLoading}
        >
          {question}
        </button>
      {/each}
    </div>

    <textarea
      name="question"
      class="question-input"
      placeholder="Ex : Comment se déroule un combat ? Combien de joueurs ?"
      required
      rows="3"
      disabled={isLoading}
      on:keydown={handleTextareaKeydown}
    ></textarea>

    <div class="form-footer">
      {#if data.games.length > 1}
        <select name="jeu" class="game-select" disabled={isLoading} bind:value={selectedGame}>
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
        <!-- Question posée -->
        {#if lastQuestion}
          <p class="question-reminder">« {lastQuestion} »</p>
        {/if}

        <!-- Jeu sélectionné -->
        <div class="game-badge">
          <span class="game-icon">🎲</span>
          <span>{form.jeu}</span>
          {#if form.matchedName}<span class="badge-tag">mentionné</span>{/if}
        </div>

        <!-- Lien de téléchargement du fichier source -->
        {#if form.fichier}
          <div class="file-download">
            <a
              href="/files/{form.fichier}"
              class="file-download-link"
              target="_blank"
              rel="noopener"
            >
              <span class="file-icon">📄</span>
              <span class="file-text">
                <span class="file-label">Fichier source</span>
                <span class="file-name"
                  >{form.fichier.split('/').pop()?.replace(/^\d+_/, '') || 'Télécharger'}</span
                >
              </span>
              <span class="file-arrow">↓</span>
            </a>
          </div>
        {/if}

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
                        p.{s.page_debut}{s.page_fin && s.page_fin !== s.page_debut
                          ? `–${s.page_fin}`
                          : ''}
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
        >{data.games.length} jeu{data.games.length > 1 ? 'x' : ''} indexé{data.games.length > 1
          ? 's'
          : ''}</span
      >
    {/if}
  </footer>
</div>

<style>
  .suggested-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .tag-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 1rem;
    padding: 0.4rem 0.9rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    white-space: nowrap;
  }

  .tag-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.95);
    transform: translateY(-1px);
  }

  .tag-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .tag-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
