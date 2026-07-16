/**
 * generate-hero-photos.js
 * ============================================================
 * Skanuje hero_images/, PRZESKALOWUJE i KOMPRESUJE każde zdjęcie
 * (dłuższa krawędź max 800px, WebP jakość 80%) przez sharp, zapisuje
 * wynik do assets/hero_img/, i generuje assets/hero-images.json
 * z listą ścieżek do już przetworzonych plików.
 *
 * DLACZEGO 800px, a nie 1920px jak w convert.js (portfolio)?
 * Karty w spirali 3D są wyświetlane w rozmiarze ~260px szerokości
 * (--card-w w CSS) — 800px daje spory zapas ostrości nawet na
 * ekranach Retina/HiDPI, bez marnowania transferu na rozdzielczość,
 * której i tak nikt nie zobaczy w tak małej karcie. To był właśnie
 * powód spowolnień: oryginalne zdjęcia z aparatu (kilkanaście MB,
 * kilka tysięcy px szerokości) renderowane w 260px kontenerze.
 *
 * RÓŻNICA OD generate-photos.js / convert.js:
 *   - convert.js              → portfolio (galeria, kategorie z podfolderów)
 *   - generate-hero-photos.js → spirala 3D (płaski folder, bez kategorii)
 *
 * UŻYCIE:
 *   node generate-hero-photos.js
 *
 * WYMAGANIA:
 *   npm install sharp (masz już zainstalowane od convert.js)
 *
 * STRUKTURA WEJŚCIOWA:
 *   hero_images/
 *   ├── zdjecie1.jpg
 *   ├── zdjecie2.png
 *   └── ...
 *
 * WYNIK:
 *   assets/hero_img/zdjecie1.webp, zdjecie2.webp, ...
 *   assets/hero-images.json → ["assets/hero_img/zdjecie1.webp", ...]
 *
 * UWAGA O RAW: tak jak w convert.js, sharp nie obsługuje plików RAW
 * (CR2, NEF, ARW...) — takie pliki są wykrywane i pomijane z ostrzeżeniem.
 */

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// --- KONFIGURACJA -----------------------------------------------
const HERO_DIR      = path.join(__dirname, 'hero_images');
const OUT_IMG_DIR    = path.join(__dirname, 'assets', 'hero_img');
const OUTPUT_JSON    = path.join(__dirname, 'assets', 'hero-images.json');
const MAX_EDGE       = 800;   // dłuższa krawędź w px — karty w spirali są małe, 800px w zupełności starcza
const WEBP_QUALITY   = 80;

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const RAW_EXT = new Set(['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.raw']);
// -------------------------------------------------------------------

async function main(){
  await fs.mkdir(OUT_IMG_DIR, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(HERO_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`❌ Nie znaleziono folderu "${HERO_DIR}". Utwórz go i wrzuć tam zdjęcia.`);
    process.exit(1);
  }

  const files = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'pl')); // kolejność w spirali = kolejność alfabetyczna

  if (files.length === 0) {
    console.warn(`⚠️  Folder "${HERO_DIR}" jest pusty. Wrzuć zdjęcia (JPG, PNG, WebP).`);
    return;
  }

  const outputPaths = [];
  let processedCount = 0;
  let skippedRawCount = 0;
  let errorCount = 0;

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    const srcPath = path.join(HERO_DIR, filename);

    if (RAW_EXT.has(ext)) {
      console.warn(`⚠️  Pomijam RAW: ${filename} (sharp nie obsługuje formatów RAW z aparatu)`);
      skippedRawCount++;
      continue;
    }

    if (!SUPPORTED_EXT.has(ext)) {
      console.warn(`⚠️  Pomijam nieobsługiwany format: ${filename}`);
      continue;
    }

    const outName = `${baseName}.webp`;
    const outPath = path.join(OUT_IMG_DIR, outName);

    try {
      await sharp(srcPath)
        .rotate() // prostuje wg EXIF (orientacja z aparatu)
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);

      outputPaths.push(`assets/hero_img/${outName}`);
      processedCount++;
      console.log(`✅ ${filename} → hero_img/${outName}`);
    } catch (err) {
      errorCount++;
      console.error(`❌ Błąd przy przetwarzaniu ${filename}: ${err.message}`);
    }
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(outputPaths, null, 2));

  console.log('\n============================================================');
  console.log(`✅ Gotowe: ${processedCount} zdjęć przetworzonych do spirali`);
  if (skippedRawCount > 0) console.log(`⚠️  Pominięto ${skippedRawCount} plików RAW`);
  if (errorCount > 0) console.log(`❌ Błędy: ${errorCount} plików`);
  console.log(`📄 Zapisano listę do: ${OUTPUT_JSON}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Błąd:', err);
  process.exit(1);
});
