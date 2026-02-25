#!/bin/bash

# Script pour créer des icônes placeholder PWA pour Ask Rules
# Ce script crée des icônes temporaires en attendant les vraies icônes

echo "🎨 Création des icônes PWA placeholder..."

# Couleurs
BG_COLOR="#4f46e5"  # Indigo
TEXT_COLOR="#ffffff"  # Blanc

# Créer le dossier static s'il n'existe pas
mkdir -p static

# Fonction pour créer une icône SVG
create_icon() {
    local size=$1
    local output=$2
    
    cat > "$output" << EOF
<svg width="$size" height="$size" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="$size" height="$size" fill="url(#grad)" rx="$(($size/8))"/>
  
  <!-- Icon content -->
  <g transform="translate($(($size/2)), $(($size/2)))">
    <!-- Game die icon -->
    <rect x="-$(($size/5))" y="-$(($size/5))" 
          width="$(($size*2/5))" height="$(($size*2/5))" 
          fill="none" stroke="white" stroke-width="$(($size/40))" 
          rx="$(($size/20))"/>
    <circle cx="-$(($size/10))" cy="-$(($size/10))" r="$(($size/30))" fill="white"/>
    <circle cx="$(($size/10))" cy="-$(($size/10))" r="$(($size/30))" fill="white"/>
    <circle cx="0" cy="0" r="$(($size/30))" fill="white"/>
    <circle cx="-$(($size/10))" cy="$(($size/10))" r="$(($size/30))" fill="white"/>
    <circle cx="$(($size/10))" cy="$(($size/10))" r="$(($size/30))" fill="white"/>
  </g>
  
  <!-- Text -->
  <text x="50%" y="85%" 
        text-anchor="middle" 
        fill="white" 
        font-family="Arial, sans-serif" 
        font-size="$(($size/10))" 
        font-weight="bold">AR</text>
</svg>
EOF
    
    echo "  ✓ Créé: $output"
}

# Créer les icônes SVG
create_icon 192 "static/icon-192.svg"
create_icon 512 "static/icon-512.svg"
create_icon 180 "static/apple-touch-icon.svg"

echo ""
echo "✅ Icônes SVG placeholder créées !"
echo ""
echo "Pour convertir en PNG (nécessite ImageMagick) :"
echo "  convert static/icon-192.svg static/icon-192.png"
echo "  convert static/icon-512.svg static/icon-512.png"
echo "  convert static/apple-touch-icon.svg static/apple-touch-icon.png"
echo ""
echo "Ou utilisez un outil en ligne :"
echo "  - https://cloudconvert.com/svg-to-png"
echo "  - https://svgtopng.com/"
echo ""
