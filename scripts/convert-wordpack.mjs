import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const input = process.argv[2] || "data/liar_game_words.xlsx";
const output = "src/data/wordPacks.ts";

if (!fs.existsSync(input)) {
  console.error(`Excel file not found: ${input}`);
  process.exit(1);
}

const workbook = XLSX.readFile(input);
const duplicateWarnings = [];

function clean(value) {
  return String(value ?? "").trim();
}

function findCategoryKey(row) {
  return Object.keys(row).find((key) => /(?:\uCE74\uD14C\uACE0\uB9AC|category|\uBD84\uB958)/i.test(key));
}

function findWordKey(row) {
  return Object.keys(row).find((key) => /(?:\uB2E8\uC5B4$|word|keyword|\uC81C\uC2DC\uC5B4)/i.test(key));
}

function readSheetPacks(sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const packs = new Map();
  const duplicates = [];

  function addSheetWord(category, word) {
    const c = clean(category);
    const w = clean(word);
    if (!c || !w) return;
    if (!packs.has(c)) packs.set(c, new Set());
    if (packs.get(c).has(w)) duplicates.push(`${c}: ${w}`);
    packs.get(c).add(w);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) return { sheetName, packs: [], duplicates };

  const first = rows[0];
  const categoryKey = findCategoryKey(first);
  const wordKey = findWordKey(first);

  if (categoryKey && wordKey) {
    rows.forEach((row) => addSheetWord(row[categoryKey], row[wordKey]));
    return {
      sheetName,
      packs: [...packs.entries()].map(([category, words]) => ({ category, words: [...words] })),
      duplicates,
    };
  }

  const objectKeys = Object.keys(first).filter((key) => clean(key));
  if (objectKeys.length >= 2) {
    objectKeys.forEach((category) => {
      rows.forEach((row) => addSheetWord(category, row[category]));
    });
    return {
      sheetName,
      packs: [...packs.entries()].map(([category, words]) => ({ category, words: [...words] })),
      duplicates,
    };
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  matrix.flat().forEach((cell) => addSheetWord(sheetName, cell));
  return {
    sheetName,
    packs: [...packs.entries()].map(([category, words]) => ({ category, words: [...words] })),
    duplicates,
  };
}

const candidates = workbook.SheetNames.map(readSheetPacks).filter((candidate) => candidate.packs.length > 0);
const perfectCandidate = candidates.find(
  (candidate) => candidate.packs.length === 20 && candidate.packs.every((pack) => pack.words.length === 100),
);
const preferredCandidate =
  perfectCandidate ??
  candidates.find((candidate) => candidate.sheetName.includes("\uB2E8\uC5B4") && candidate.packs.length >= 20) ??
  candidates.sort((a, b) => b.packs.reduce((sum, pack) => sum + pack.words.length, 0) - a.packs.reduce((sum, pack) => sum + pack.words.length, 0))[0];

if (!preferredCandidate) {
  console.error("No readable word data was found.");
  process.exit(1);
}

const result = preferredCandidate.packs
  .map((pack) => ({ category: pack.category, words: pack.words.filter(Boolean) }))
  .filter((pack) => pack.words.length > 0);
duplicateWarnings.push(...preferredCandidate.duplicates);

const warnings = [];
if (result.length !== 20) warnings.push(`Expected 20 categories, found ${result.length}.`);

for (const pack of result) {
  if (pack.words.length !== 100) {
    warnings.push(`${pack.category}: expected 100 words, found ${pack.words.length}.`);
  }
}

if (warnings.length) {
  console.warn("Word pack warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (duplicateWarnings.length) {
  console.warn("Duplicate word warnings:");
  duplicateWarnings.slice(0, 30).forEach((warning) => console.warn(`- ${warning}`));
  if (duplicateWarnings.length > 30) console.warn(`- ...and ${duplicateWarnings.length - 30} more`);
}

const file = `export type WordPack = {
  category: string;
  words: string[];
};

export const wordPacks: WordPack[] = ${JSON.stringify(result, null, 2)};

export const wordPackCategories = wordPacks.map((pack) => pack.category);
`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, file, "utf8");

console.log(`Wrote ${output}`);
console.log(`Source sheet: ${preferredCandidate.sheetName}`);
console.log(`Categories: ${result.length}`);
console.log(`Words: ${result.reduce((sum, pack) => sum + pack.words.length, 0)}`);
