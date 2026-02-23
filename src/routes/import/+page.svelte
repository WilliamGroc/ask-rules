<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let isLoading = false;
  let selectedGame = '';
  let gameNameValue = '';

  function onGameSelect(e: Event) {
    const select = e.target as HTMLSelectElement;
    selectedGame = select.value;
    if (selectedGame) {
      const game = data.games.find((g) => g.id === selectedGame);
      if (game) gameNameValue = game.jeu;
    }
  }
</script>

<svelte:head>
  <title>Ask Rules — Importer des règles</title>
  <meta
    name="description"
    content="Importez un fichier de règles de jeu de société."
  />
</svelte:head>

<div class="page">
  <!-- En-tête -->
  <header class="header">
    <h1 class="logo">Importer des règles</h1>
    <p class="tagline">
      Ajoutez un fichier .txt ou .pdf à la base de connaissance
    </p>
  </header>

  <!-- Formulaire -->
  <form
    method="POST"
    enctype="multipart/form-data"
    class="import-form"
    use:enhance={() => {
      isLoading = true;
      return async ({ update }) => {
        await update();
        isLoading = false;
      };
    }}
  >
    <!-- Nom du jeu -->
    <div class="form-group">
      <label class="form-label" for="gameName"
        >Nom du jeu <span class="required">*</span></label
      >
      <input
        id="gameName"
        name="gameName"
        type="text"
        class="text-input"
        placeholder="Ex : Catan, 7 Wonders, Terraforming Mars…"
        bind:value={gameNameValue}
        disabled={isLoading}
      />
    </div>

    <!-- Jeu existant (optionnel) -->
    {#if data.games.length > 0}
      <div class="form-group">
        <label class="form-label" for="existingGame">
          Mettre à jour un jeu existant
          <span class="form-hint">optionnel — pré-remplit le nom</span>
        </label>
        <select
          id="existingGame"
          class="game-select"
          disabled={isLoading}
          on:change={onGameSelect}
        >
          <option value="">— Nouveau jeu —</option>
          {#each data.games as g}
            <option value={g.id}>{g.jeu}</option>
          {/each}
        </select>
      </div>

      <!-- Mode : remplacer ou fusionner -->
      {#if selectedGame}
        <div class="form-group">
          <span class="form-label">Mode d'import</span>
          <div class="radio-group">
            <label class="radio-label">
              <input
                type="radio"
                name="mode"
                value="replace"
                checked
                disabled={isLoading}
              />
              <span class="radio-text">
                <strong>Remplacer</strong>
                <span class="radio-hint"
                  >Efface les sections existantes et les remplace</span
                >
              </span>
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="mode"
                value="merge"
                disabled={isLoading}
              />
              <span class="radio-text">
                <strong>Fusionner</strong>
                <span class="radio-hint"
                  >Ajoute les nouvelles sections sans toucher aux existantes</span
                >
              </span>
            </label>
          </div>
        </div>
      {:else}
        <!-- Valeur cachée par défaut -->
        <input type="hidden" name="mode" value="replace" />
      {/if}
    {:else}
      <input type="hidden" name="mode" value="replace" />
    {/if}

    <!-- Fichier -->
    <div class="form-group">
      <label class="form-label" for="fichier"
        >Fichier de règles <span class="required">*</span></label
      >
      <div class="file-input-wrapper">
        <input
          id="fichier"
          name="fichier"
          type="file"
          accept=".txt,.pdf"
          disabled={isLoading}
          class="file-input"
        />
        <span class="file-hint">.txt ou .pdf</span>
      </div>
    </div>

    <!-- Bouton -->
    <div class="form-actions">
      <button
        type="submit"
        class="submit-btn{isLoading ? ' loading' : ''}"
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="spinner" aria-hidden="true"></span>Indexation en cours…
        {:else}
          Importer →
        {/if}
      </button>
    </div>
  </form>

  <!-- Résultat -->
  {#if form}
    <section class="result-section" aria-live="polite">
      {#if !form.ok}
        <div class="error-card" role="alert">
          <span class="error-icon">⚠</span>
          {form.error}
        </div>
      {:else}
        <div class="success-card">
          <div class="success-header">
            <span class="success-icon">✔</span>
            <span>Indexation terminée</span>
          </div>
          <div class="success-body">
            <div class="success-row">
              <span class="success-key">Jeu</span>
              <span class="success-val">{form.jeu}</span>
            </div>
            <div class="success-row">
              <span class="success-key">Sections</span>
              <span class="success-val"
                >{form.sections} section{form.sections > 1 ? 's' : ''} indexée{form.sections >
                1
                  ? 's'
                  : ''}</span
              >
            </div>
            <div class="success-row">
              <span class="success-key">Action</span>
              <span class="success-val success-action">{form.action}</span>
            </div>
            {#if form.mecaniques && form.mecaniques.length > 0}
              <div class="success-row">
                <span class="success-key">Mécaniques</span>
                <span class="success-val">{form.mecaniques.join(', ')}</span>
              </div>
            {/if}
          </div>
        </div>
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
          : ''} dans la base</span
      >
    {:else}
      <span>Base vide — importez votre premier jeu</span>
    {/if}
  </footer>
</div>
