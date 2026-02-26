/**
 * Script d'enregistrement du Service Worker pour la PWA
 * À inclure dans app.html ou dans un composant Svelte
 */

// Fonction pour enregistrer le service worker
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });

      console.log('[PWA] Service Worker enregistré avec succès:', registration.scope);

      // Gérer les mises à jour du service worker
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouveau service worker disponible
              console.log('[PWA] Nouvelle version disponible !');

              // Afficher une notification à l'utilisateur (optionnel)
              if (
                confirm('Une nouvelle version de Reglomatic est disponible. Voulez-vous recharger ?')
              ) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        }
      });

      // Recharger quand un nouveau service worker prend le contrôle
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } catch (error) {
      console.error("[PWA] Erreur lors de l'enregistrement du Service Worker:", error);
    }
  } else {
    console.warn('[PWA] Les Service Workers ne sont pas supportés par ce navigateur');
  }
}

// Enregistrer le service worker quand la page est chargée
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

// Gestion de l'événement beforeinstallprompt (pour le bouton d'installation)
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('[PWA] Événement beforeinstallprompt déclenché');
  // Empêcher l'affichage automatique
  e.preventDefault();
  // Stocker l'événement pour l'utiliser plus tard
  deferredPrompt = e;

  // Afficher votre propre UI d'installation (optionnel)
  // showInstallPromotion();
});

// Fonction pour déclencher l'installation manuellement
export async function promptInstall() {
  if (!deferredPrompt) {
    console.log('[PWA] Aucune installation disponible');
    return false;
  }

  // Afficher le prompt d'installation
  deferredPrompt.prompt();

  // Attendre la réponse de l'utilisateur
  const { outcome } = await deferredPrompt.userChoice;
  console.log('[PWA] Choix utilisateur:', outcome);

  // Réinitialiser la variable
  deferredPrompt = null;

  return outcome === 'accepted';
}

// Vérifier si l'app est déjà installée
export function isInstalled() {
  // Vérifier si l'app est lancée en mode standalone
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

// Afficher le statut d'installation
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installée avec succès !');
  deferredPrompt = null;
});
