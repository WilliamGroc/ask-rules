# Guide PWA - Ask Rules

## Implémentation PWA complète

L'application Ask Rules est maintenant une Progressive Web App (PWA) complète avec support hors ligne.

## Fonctionnalités PWA

### ✅ Installable

- L'app peut être installée sur desktop et mobile
- Bouton d'installation automatique qui apparaît quand disponible
- Icône sur l'écran d'accueil

### ✅ Hors ligne

- Fonctionne sans connexion internet (mode limité)
- Cache intelligent des ressources
- Stratégie Network First pour les données fraîches

### ✅ Rapide

- Chargement instantané des pages en cache
- Mise à jour en arrière-plan
- Expérience native

## Fichiers PWA

### 1. Service Worker

**Fichier**: [static/service-worker.js](../static/service-worker.js)

Le service worker gère :

- **Cache des assets** : HTML, CSS, JS, images
- **Stratégie Network First** : Essaie le réseau d'abord, puis le cache
- **Nettoyage automatique** : Supprime les anciens caches
- **Mode hors ligne** : Affiche la page d'accueil si pas de réseau

```javascript
// Stratégie: Network First, fallback Cache, puis Offline
```

### 2. Enregistrement PWA

**Fichier**: [static/pwa-register.js](../static/pwa-register.js)

Gère :

- Enregistrement du service worker
- Détection des mises à jour
- Prompt d'installation
- Rechargement automatique

### 3. Composant UI d'installation

**Fichier**: [src/lib/PWAInstall.svelte](../src/lib/PWAInstall.svelte)

Bannière d'installation qui :

- Apparaît automatiquement quand l'installation est possible
- Peut être fermée (ne réapparaît pas pendant 7 jours)
- Design modern et responsive
- Gère l'état d'installation

### 4. Manifest

**Fichier**: [static/manifest.json](../static/manifest.json)

Configuration PWA :

```json
{
  "name": "Ask Rules",
  "short_name": "Ask Rules",
  "display": "standalone",
  "theme_color": "#4f46e5",
  "background_color": "#ffffff"
}
```

## Installation

### Sur Desktop (Chrome/Edge)

1. Cliquez sur l'icône ➕ dans la barre d'adresse
2. Ou cliquez sur "Installer" dans la bannière
3. L'app apparaît dans vos applications

### Sur Mobile (iOS Safari)

1. Ouvrez le site dans Safari
2. Tapez sur le bouton "Partager"
3. Sélectionnez "Sur l'écran d'accueil"
4. Tapez "Ajouter"

### Sur Mobile (Android Chrome)

1. La bannière d'installation apparaît automatiquement
2. Tapez "Installer"
3. L'app est ajoutée à votre écran d'accueil

## Tester la PWA

### En développement

1. **Lancer le serveur** :

```bash
pnpm dev
```

2. **Ouvrir les DevTools Chrome** :
   - Onglet "Application"
   - Section "Service Workers"
   - Vérifier que le SW est enregistré

3. **Tester le mode hors ligne** :
   - DevTools > Network > Throttling > Offline
   - Rafraîchir la page
   - L'app devrait fonctionner

4. **Tester l'installation** :
   - DevTools > Application > Manifest
   - Cliquer sur "Update on reload"
   - Vérifier les icônes et la config

### Lighthouse Audit

```bash
# Construire pour la production
pnpm build
pnpm preview

# Puis dans Chrome DevTools > Lighthouse
# Cocher "Progressive Web App"
# Lancer l'audit
```

Score cible : **90+/100**

## Configuration Production

### Variables d'environnement

```bash
# .env
PUBLIC_APP_URL=https://votre-domaine.com
```

### Requirement HTTPS

⚠️ **Important** : Les PWA nécessitent HTTPS en production !

- En développement : `http://localhost` fonctionne
- En production : Obligatoire HTTPS

### Déploiement

1. **Build** :

```bash
pnpm build
```

2. **Vérifier les fichiers** :
   - `build/client/service-worker.js`
   - `build/client/pwa-register.js`
   - `build/client/manifest.json`

3. **Déployer** avec HTTPS activé

## Icônes requises

Pour une PWA complète, ajoutez dans `static/` :

### Icônes PWA

- **icon-192.png** (192x192) - Icône petite taille
- **icon-512.png** (512x512) - Icône grande taille

### Autres icônes

- **favicon.ico** (32x32)
- **apple-touch-icon.png** (180x180)

Créez-les avec des outils comme :

- https://realfavicongenerator.net/
- https://www.pwabuilder.com/imageGenerator

## Fonctionnalités avancées possibles

### 🔔 Notifications Push

```javascript
// À ajouter dans le service worker
self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
  });
});
```

### 🔄 Background Sync

```javascript
// Synchroniser les données en arrière-plan
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-questions') {
    event.waitUntil(syncQuestions());
  }
});
```

### 📂 File System Access

```javascript
// Sauvegarder les règles localement
const fileHandle = await window.showSaveFilePicker();
```

## Mises à jour

### Stratégie de mise à jour

Le service worker utilise une stratégie de mise à jour automatique :

1. **Détection** : Vérifie les mises à jour toutes les 24h
2. **Installation** : Télécharge le nouveau SW en arrière-plan
3. **Notification** : Demande à l'utilisateur de recharger
4. **Activation** : Active le nouveau SW après accept

### Forcer une mise à jour

```javascript
// Dans la console du navigateur
navigator.serviceWorker.getRegistration().then((reg) => {
  reg.update();
});
```

## Debugging

### Logs du Service Worker

```javascript
// Voir les logs du SW dans la console
// Chrome DevTools > Application > Service Workers > Inspect
```

### Supprimer le cache

```javascript
// Dans la console
caches.keys().then((names) => {
  names.forEach((name) => caches.delete(name));
});
```

### Désinstaller le Service Worker

```javascript
navigator.serviceWorker.getRegistrations().then((registrations) => {
  registrations.forEach((reg) => reg.unregister());
});
```

## Checklist PWA

### ✅ Implémenté

- [x] Service Worker fonctionnel
- [x] Manifest.json configuré
- [x] Mode hors ligne
- [x] Cache stratégique
- [x] Bannière d'installation
- [x] Mise à jour automatique
- [x] Display: standalone
- [x] Theme color défini
- [x] Meta tags mobile

### 📋 À compléter

- [ ] Créer les icônes (192x192 et 512x512)
- [ ] Tester sur plusieurs appareils
- [ ] Vérifier le score Lighthouse (>90)
- [ ] Activer HTTPS en production
- [ ] Tester le mode hors ligne complet

### 🚀 Améliorations futures (optionnelles)

- [ ] Notifications push
- [ ] Background sync
- [ ] Share API
- [ ] File System Access
- [ ] Badge API

## Ressources

- [MDN - Progressive Web Apps](https://developer.mozilla.org/fr/docs/Web/Progressive_web_apps)
- [web.dev - PWA Checklist](https://web.dev/pwa-checklist/)
- [PWA Builder](https://www.pwabuilder.com/)
- [Workbox - Google](https://developers.google.com/web/tools/workbox)

## Support navigateurs

| Fonctionnalité  | Chrome | Firefox | Safari | Edge |
| --------------- | ------ | ------- | ------ | ---- |
| Service Worker  | ✅     | ✅      | ✅     | ✅   |
| App Manifest    | ✅     | ✅      | ✅     | ✅   |
| Installation    | ✅     | ⚠️      | ⚠️     | ✅   |
| Mode hors ligne | ✅     | ✅      | ✅     | ✅   |

✅ Support complet | ⚠️ Support partiel

## Performance

### Métriques attendues

- **First Load** : < 3s
- **Subsequent Loads** : < 1s (depuis le cache)
- **Offline Load** : < 500ms
- **Install Size** : < 5MB

### Optimisations

1. **Cache sélectif** : Ne cache que les assets nécessaires
2. **Network First** : Données toujours fraîches quand online
3. **Lazy Loading** : Charge les images à la demande
4. **Compression** : Utilise Brotli/Gzip en production

## Conclusion

Ask Rules est maintenant une PWA complète avec :

- ⚡ Performances optimales
- 📱 Installation facile
- 🔄 Mises à jour automatiques
- 📡 Fonctionnement hors ligne
- 🎨 Expérience native

Pour finaliser, ajoutez les icônes et testez sur différents appareils !
