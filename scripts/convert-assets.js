#!/usr/bin/env node

/**
 * Script de conversion des icônes SVG en PNG
 * Utilise Sharp pour convertir automatiquement tous les assets
 *
 * Usage :
 *   node scripts/convert-assets.js
 */

import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STATIC_DIR = 'static';

const conversions = [
  { input: 'icon-192.svg', output: 'icon-192.png', size: 192 },
  { input: 'icon-512.svg', output: 'icon-512.png', size: 512 },
  { input: 'apple-touch-icon.svg', output: 'apple-touch-icon.png', size: 180 },
  { input: 'favicon.svg', output: 'favicon-32.png', size: 32 },
  { input: 'favicon.svg', output: 'favicon-16.png', size: 16 },
  { input: 'og-image.svg', output: 'og-image.png', size: 1200 },
];

console.log('🎨 Conversion des assets SVG en PNG...\n');

let successCount = 0;
let errorCount = 0;

for (const { input, output, size } of conversions) {
  try {
    const inputPath = join(STATIC_DIR, input);
    const outputPath = join(STATIC_DIR, output);

    if (!existsSync(inputPath)) {
      console.log(`⚠️  ${input} n'existe pas, ignoré`);
      continue;
    }

    const svg = readFileSync(inputPath);

    // Pour og-image, garder le ratio
    if (input === 'og-image.svg') {
      await sharp(svg).resize(1200, 630, { fit: 'cover' }).png({ quality: 90 }).toFile(outputPath);
    } else {
      await sharp(svg).resize(size, size).png({ quality: 95 }).toFile(outputPath);
    }

    console.log(`✅ ${output} (${size}x${size})`);
    successCount++;
  } catch (error) {
    console.error(`❌ Erreur lors de la conversion de ${input}:`, error.message);
    errorCount++;
  }
}

console.log(`\n📊 Résultat: ${successCount} succès, ${errorCount} erreurs`);

// Créer un favicon ICO multi-résolution si les PNG existent
try {
  const favicon32 = join(STATIC_DIR, 'favicon-32.png');
  const favicon16 = join(STATIC_DIR, 'favicon-16.png');

  if (existsSync(favicon32) && existsSync(favicon16)) {
    console.log('\n💡 Pour créer un favicon.ico multi-résolution:');
    console.log('   convert favicon-32.png favicon-16.png -colors 256 favicon.ico');
    console.log('   (nécessite ImageMagick)');
  }
} catch (error) {
  // Ignorer les erreurs de création de favicon ICO
}

console.log('\n✨ Conversion terminée !');
