import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceDir = new URL('../src/', import.meta.url);
const languages = ['es', 'en'];
const errors = [];

function readCatalog(language) {
  const file = new URL(`locales/${language}/translation.json`, sourceDir);
  const catalog = JSON.parse(readFileSync(file, 'utf8'));
  const entries = new Map();

  function collect(value, key) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, child] of Object.entries(value)) {
        collect(child, key ? `${key}.${name}` : name);
      }
      return;
    }
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${language}: empty or invalid translation for ${key}`);
      return;
    }
    entries.set(key, value);
  }
  collect(catalog, '');
  return entries;
}

function variables(text) {
  return [...new Set([...text.matchAll(/\{\{\s*-?\s*([^},\s]+)[^}]*\}\}/g)]
    .map(match => match[1]))].sort().join(', ');
}

const [es, en] = languages.map(readCatalog);
for (const key of new Set([...es.keys(), ...en.keys()])) {
  if (!es.has(key)) errors.push(`es: missing ${key}`);
  if (!en.has(key)) errors.push(`en: missing ${key}`);
  if (es.has(key) && en.has(key) && variables(es.get(key)) !== variables(en.get(key))) {
    errors.push(`es/en: interpolation variables differ for ${key}`);
  }
}

const textAttributes = new Set(['alt', 'aria-description', 'aria-label', 'label', 'placeholder', 'title']);
// Units, input examples, and product names shared across languages.
const neutralText = new Set([
  'h', 'km', 'L', 'L)', '5W-30', 'API SP', 'gal ·', 'USD', 'CSV', 'JSON', 'x', 'WA', '💬 WA', 'WhatsApp', 'ABC123',
  'taller@ejemplo.com', 'admin@taller.com', 'usuario@taller.com',
]);

function requiresTranslation(text) {
  const value = text.trim().replace(/&(?:\w+|#\d+);/g, '');
  return /\p{L}/u.test(value) && !neutralText.has(value) && !/^https:\/\//.test(value);
}

function checkSource(file) {
  const path = fileURLToPath(new URL(file.replaceAll('\\', '/'), sourceDir));
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);

  function report(node, message) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    errors.push(`${file}:${line + 1}: ${message}`);
  }

  function checkText(node, value) {
    if (requiresTranslation(value)) report(node, `use a translation key for ${JSON.stringify(value.trim())}`);
  }

  function checkExpression(node) {
    if (!node) return;
    if (ts.isStringLiteralLike(node)) checkText(node, node.text);
    if (ts.isParenthesizedExpression(node)) checkExpression(node.expression);
    if (ts.isConditionalExpression(node)) {
      checkExpression(node.whenTrue);
      checkExpression(node.whenFalse);
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) checkText(node, node.text);
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)
      && !(ts.isJsxElement(node.parent) && node.parent.openingElement.tagName.getText(source) === 'style')) {
      checkExpression(node.expression);
    }
    if (ts.isJsxAttribute(node) && textAttributes.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        checkText(node.initializer, node.initializer.text);
      } else {
        checkExpression(node.initializer?.expression);
      }
    }
    if (ts.isCallExpression(node) && /^(?:t|(?:appI18n|i18n)\.t)$/.test(node.expression.getText(source))) {
      const key = node.arguments[0];
      if (key && ts.isStringLiteralLike(key) && !es.has(key.text) && !es.has(`${key.text}_other`)) {
        report(key, `missing translation key ${key.text}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

for (const file of readdirSync(sourceDir, { recursive: true })) {
  if (/\.tsx?$/.test(file)) checkSource(file);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`i18n: verified ${es.size} translation keys in Spanish and English.`);
}
