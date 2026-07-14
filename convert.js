/**
 * convert.js
 * ============================================================
 * Skanuje src_images/<kategoria>/*.jpg|png, przeskalowuje każde
 * zdjęcie (dłuższa krawędź max 1920px, proporcje zachowane),
 * konwertuje do .webp (jakość 80%) i zapisuje płasko w assets/img/.
 * Na koniec generuje assets/images-data.json z listą
 * { path, category } dla każdego przetworzonego zdjęcia.
 *
 * UŻYCIE:
 *   node convert.js
 *
 * WYMAGANIA:
 *   npm install sharp
 *
 * UWAGA O PLIKACH RAW (CR2, NEF, ARW, DNG...):
 *   sharp/libvips NIE obsługuje surowych formatów RAW z aparatu —
 *   tylko standardowe formaty rastrowe (JPG, PNG, TIFF, WebP...).
 *   Ten skrypt WYKRYWA pliki RAW i pomija je z ostrzeżeniem,
 *   zamiast próbować je przetworzyć i wywalić się błędem w środku
 *   batcha. Jeśli faktycznie chcesz przetwarzać RAW-y, zobacz
 *   sekcję "CO Z RAW-AMI?" na samym dole tego pliku.
 */

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// --- KONFIGURACJA — dostosuj do siebie -----------------------------
const SRC_DIR       = path.join(__dirname, 'src_images');       // folder wejściowy z podfolderami-kategoriami
const OUT_IMG_DIR   = path.join(__dirname, 'assets', 'img');    // folder wyjściowy — płaska struktura .webp
const OUT_JSON_PATH = path.join(__dirname, 'assets', 'images-data.json');
const MAX_EDGE      = 1920;  // maksymalna długość dłuższej krawędzi, w px
const WEBP_QUALITY  = 80;    // jakość WebP, 0-100

// Formaty, które sharp faktycznie potrafi wczytać
const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff']);

// Popularne rozszerzenia RAW — wykrywane, ale świadomie pomijane
const RAW_EXT = new Set(['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.raw']);
// ---------------------------------------------------------------------

/** Zamienia polskie znaki / spacje / wielkie litery na bezpieczny "slug" do nazwy pliku. */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => ({ ą:'a', ć:'c', ę:'e', ł:'l', ń:'n', ó:'o', ś:'s', ź:'z', ż:'z' }[ch]))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Zwraca listę podfolderów (kategorii) wewnątrz danego folderu. */
async function getCategoryFolders(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

/** Zwraca listę plików (nie folderów) wewnątrz danego folderu. */
async function getFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => e.name);
}

async function main() {
  console.log('🔍 Skanuję', SRC_DIR, '...\n');

  // Upewniamy się, że folder wyjściowy istnieje (recursive: true tworzy
  // też assets/, jeśli jeszcze nie istnieje)
  await fs.mkdir(OUT_IMG_DIR, { recursive: true });

  let categories;
  try {
    categories = await getCategoryFolders(SRC_DIR);
  } catch (err) {
    console.error(`❌ Nie znaleziono folderu "${SRC_DIR}". Utwórz go i dodaj podfoldery-kategorie (np. reportaz/, portret/).`);
    process.exit(1);
  }

  if (categories.length === 0) {
    console.warn(`⚠️  Folder "${SRC_DIR}" istnieje, ale nie ma w nim żadnych podfolderów-kategorii.`);
    return;
  }

  const imagesData = [];   // tu zbieramy wpisy do images-data.json
  const usedNames = new Set(); // pilnuje unikalności nazw plików w płaskiej strukturze wyjściowej

  let processedCount = 0;
  let skippedRawCount = 0;
  let errorCount = 0;

  for (const category of categories) {
    const categoryDir = path.join(SRC_DIR, category);
    const files = await getFiles(categoryDir);

    if (files.length === 0) {
      console.log(`📁 ${category}/ — brak plików, pomijam.`);
      continue;
    }

    console.log(`📁 ${category}/ (${files.length} plików)`);

    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      const baseName = path.basename(filename, ext);
      const srcPath = path.join(categoryDir, filename);

      // --- Pliki RAW: wykryj i świadomie pomiń, zamiast udawać sukces ---
      if (RAW_EXT.has(ext)) {
        console.warn(`   ⚠️  Pomijam RAW: ${filename} (sharp nie obsługuje formatów RAW z aparatu — patrz komentarz na górze pliku)`);
        skippedRawCount++;
        continue;
      }

      if (!SUPPORTED_EXT.has(ext)) {
        console.warn(`   ⚠️  Pomijam nieobsługiwany format: ${filename}`);
        continue;
      }

      // Budujemy unikalną nazwę wyjściową — struktura wyjściowa jest PŁASKA
      // (wszystkie kategorie ląduje w jednym assets/img/), więc dwa pliki
      // o tej samej nazwie z różnych kategorii nadpisałyby się nawzajem.
      // Prefiksujemy nazwę kategorią, żeby tego uniknąć.
      let outName = `${slugify(category)}-${slugify(baseName)}.webp`;
      let counter = 1;
      while (usedNames.has(outName)) {
        // Gdyby i to nie wystarczyło (np. dwa identyczne baseName w tej
        // samej kategorii po slugify), dokładamy licznik na końcu.
        outName = `${slugify(category)}-${slugify(baseName)}-${counter}.webp`;
        counter++;
      }
      usedNames.add(outName);

      const outPath = path.join(OUT_IMG_DIR, outName);

      try {
        await sharp(srcPath)
          .rotate() // automatycznie prostuje zdjęcie wg danych EXIF (orientacja z aparatu)
          .resize({
            width: MAX_EDGE,
            height: MAX_EDGE,
            fit: 'inside',          // dłuższa krawędź = MAX_EDGE, proporcje zachowane
            withoutEnlargement: true // nie powiększaj zdjęć, które już są mniejsze niż MAX_EDGE
          })
          .webp({ quality: WEBP_QUALITY })
          .toFile(outPath);

        // Ścieżka zapisywana do JSON-a — względna od katalogu strony,
        // dokładnie taka, jakiej front-end użyje w <img src="...">
        const relativePath = `assets/img/${outName}`;

        imagesData.push({
          path: relativePath,
          category: category
        });

        processedCount++;
        console.log(`   ✅ ${filename} → ${outName}`);
      } catch (err) {
        errorCount++;
        console.error(`   ❌ Błąd przy przetwarzaniu ${filename}: ${err.message}`);
      }
    }
  }

  await fs.writeFile(OUT_JSON_PATH, JSON.stringify(imagesData, null, 2));

  console.log('\n============================================================');
  console.log(`✅ Gotowe: ${processedCount} zdjęć przetworzonych`);
  if (skippedRawCount > 0) console.log(`⚠️  Pominięto ${skippedRawCount} plików RAW (patrz ostrzeżenia wyżej)`);
  if (errorCount > 0) console.log(`❌ Błędy: ${errorCount} plików nie udało się przetworzyć`);
  console.log(`📄 Zapisano listę do: ${OUT_JSON_PATH}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Nieoczekiwany błąd skryptu:', err);
  process.exit(1);
});

/**
 * ============================================================
 * CO Z RAW-AMI?
 * ============================================================
 * Jeśli faktycznie chcesz automatyzować też pliki RAW z aparatu,
 * sharp sam z siebie tego nie zrobi. Dwie sensowne opcje:
 *
 * 1) Wyeksportuj RAW-y do TIFF/JPG wcześniej — w Lightroomie,
 *    Capture One, albo darmowym RawTherapee (ma tryb wsadowy /
 *    command-line, można to nawet zautomatyzować osobnym skryptem
 *    wywołującym `rawtherapee-cli`). Ten convert.js przetworzy
 *    już te wyeksportowane pliki normalnie.
 *
 * 2) Użyj biblioteki `dcraw` lub `libraw` (np. pakiet npm
 *    `raw-decoder` albo wywołanie `dcraw` jako procesu potomnego
 *    przez `child_process.exec`) do wstępnej konwersji RAW → TIFF,
 *    a dopiero potem przepuść wynik przez sharp jak w tym skrypcie.
 *    To wymaga zainstalowania dcraw jako osobnego programu w systemie
 *    (nie jest to sama biblioteka npm) — więcej ruchu niż warto na
 *    start, jeśli głównie pracujesz na już wyeksportowanych JPG-ach.
 */
