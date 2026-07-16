/**
 * generate-hero-photos.js
 * ============================================================
 * Skanuje folder hero_images/ i generuje assets/hero-images.json
 * Spirala 3D w hero sekcji pobiera zdjęcia z tego pliku.
 *
 * RÓŻNICA OD generate-photos.js:
 *   - generate-photos.js → portfolio (galeria z filtrami)
 *   - generate-hero-photos.js → spirala 3D (hero sekcja)
 *
 * UŻYCIE:
 *   node generate-hero-photos.js
 *
 * WYMAGANIA:
 *   npm install sharp (jeśli jeszcze nie zainstalowany)
 *
 * STRUKTURA:
 *   hero_images/
 *   ├── zdjecie1.jpg
 *   ├── zdjecie2.png
 *   └── ...
 *
 * WYNIK:
 *   assets/hero-images.json
 *   [
 *     "hero_images/zdjecie1.jpg",
 *     "hero_images/zdjecie2.png",
 *     ...
 *   ]
 */

const fs = require('fs/promises');
const path = require('path');

// --- KONFIGURACJA -----------------------------------------------
const HERO_DIR      = path.join(__dirname, 'hero_images');
const OUTPUT_PATH   = path.join(__dirname, 'assets', 'hero-images.json');
const ALLOWED_EXT   = new Set(['.jpg', '.jpeg', '.png', '.webp']);
// -------------------------------------------------------------------

async function main(){
  let files;

  try {
    const entries = await fs.readdir(HERO_DIR, { withFileTypes: true });
    files = entries
      .filter(e => e.isFile() && ALLOWED_EXT.has(path.extname(e.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
      .map(e => `hero_images/${e.name}`);
  } catch (err) {
    console.error(`❌ Nie znaleziono folderu "${HERO_DIR}". Utwórz go i wrzuć tam zdjęcia.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(`⚠️  Folder "${HERO_DIR}" jest pusty. Wrzuć zdjęcia (JPG, PNG, WebP).`);
  }

  // Upewniamy się, że assets/ istnieje
  await fs.mkdir(path.join(__dirname, 'assets'), { recursive: true });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(files, null, 2));

  console.log(`✅ Zapisano ${files.length} zdjęć do spirali 3D:`);
  files.forEach(f => console.log(`   - ${f}`));
  console.log(`📄 Plik: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('❌ Błąd:', err);
  process.exit(1);
});
