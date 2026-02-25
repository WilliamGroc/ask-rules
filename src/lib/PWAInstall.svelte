<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let showInstallPrompt = false;
  let isInstalled = false;
  let deferredPrompt: any = null;

  onMount(() => {
    if (!browser) return;

    // Vérifier si déjà installé
    isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isInstalled) {
      showInstallPrompt = false;
      return;
    }

    // Écouter l'événement beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPrompt = true;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Écouter l'installation
    const handleAppInstalled = () => {
      console.log('[PWA] App installée');
      showInstallPrompt = false;
      isInstalled = true;
      deferredPrompt = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  });

  async function handleInstallClick() {
    if (!deferredPrompt) {
      console.log('[PWA] Aucune installation disponible');
      return;
    }

    // Afficher le prompt
    deferredPrompt.prompt();

    // Attendre le choix de l'utilisateur
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Choix:', outcome);

    if (outcome === 'accepted') {
      console.log('[PWA] Installation acceptée');
    } else {
      console.log('[PWA] Installation refusée');
    }

    deferredPrompt = null;
    showInstallPrompt = false;
  }

  function handleDismiss() {
    showInstallPrompt = false;
    // Stocker le refus dans le localStorage pour ne pas redemander tout de suite
    if (browser) {
      localStorage.setItem('pwa-dismissed', Date.now().toString());
    }
  }

  // Ne pas afficher si déjà refusé récemment (< 7 jours)
  $: if (browser && showInstallPrompt) {
    const dismissed = localStorage.getItem('pwa-dismissed');
    if (dismissed) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        showInstallPrompt = false;
      }
    }
  }
</script>

{#if showInstallPrompt}
  <div class="pwa-install-banner">
    <div class="pwa-content">
      <div class="pwa-icon">📱</div>
      <div class="pwa-text">
        <strong>Installez Ask Rules</strong>
        <p>Accédez rapidement à vos règles de jeux, même hors ligne !</p>
      </div>
    </div>
    <div class="pwa-actions">
      <button class="btn-install" on:click={handleInstallClick}> Installer </button>
      <button class="btn-dismiss" on:click={handleDismiss} aria-label="Fermer"> ✕ </button>
    </div>
  </div>
{/if}

<style>
  .pwa-install-banner {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    right: 1rem;
    max-width: 500px;
    margin: 0 auto;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 1rem;
    z-index: 1000;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .pwa-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
  }

  .pwa-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .pwa-text {
    flex: 1;
  }

  .pwa-text strong {
    display: block;
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .pwa-text p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.95;
  }

  .pwa-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .btn-install {
    background: white;
    color: #667eea;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }

  .btn-install:hover {
    background: #f0f0f0;
    transform: scale(1.05);
  }

  .btn-dismiss {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: none;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
  }

  .btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  @media (max-width: 640px) {
    .pwa-install-banner {
      left: 0.5rem;
      right: 0.5rem;
      bottom: 0.5rem;
      padding: 0.875rem;
    }

    .pwa-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .pwa-actions {
      width: 100%;
      justify-content: space-between;
    }

    .btn-install {
      flex: 1;
    }
  }
</style>
