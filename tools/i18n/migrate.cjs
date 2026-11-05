// One-off migration from the old French-text-as-key translation to i18next keys.
//   node tools/i18n/migrate.cjs          → dry run: prints the key list and statistics
//   node tools/i18n/migrate.cjs --write  → rewrites src/ and writes public/locales/<lang>.json
// Each French UI text found by scan.cjs becomes t("namespace.key", { vars }): the namespace is the
// file's name (or "common" when several files use the text), the key is built from the English
// translation, and ${…} placeholders become named {{variables}}.

const fs = require("node:fs");
const path = require("node:path");
const { scan, ROOT, LANGS, ts } = require("./scan.cjs");

const WRITE = process.argv.includes("--write");
const { dict, hits } = scan();

// ---------- namespaces and keys ----------

const namespaceOf = (file) => path.basename(file, ".ts");
const filesByText = new Map();
for (const hit of hits) {
  if (!filesByText.has(hit.core)) filesByText.set(hit.core, new Set());
  filesByText.get(hit.core).add(hit.file);
}

const STOP = new Set(["a", "an", "the", "of", "to", "and", "or", "in", "on", "for", "is", "it", "its", "be", "this", "that", "with", "your", "you", "at", "by", "as"]);

/** "Copy the next system (when you arrive)" → "copyNextSystemWhenArrive". */
function slug(text) {
  const words = text
    .replace(/\{\d+\}/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  const useful = words.filter((w) => !STOP.has(w));
  const picked = (useful.length ? useful : words).slice(0, 6);
  if (!picked.length) return "text";
  let key = picked.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
  if (/^\d/.test(key)) key = "n" + key;
  return key.slice(0, 48);
}

const keyOfText = new Map(); // French text → "namespace.key"
const usedKeys = new Map(); // namespace → Set of keys
for (const text of [...filesByText.keys()].sort()) {
  const files = filesByText.get(text);
  const ns = files.size > 1 ? "common" : namespaceOf([...files][0]);
  if (!usedKeys.has(ns)) usedKeys.set(ns, new Set());
  const taken = usedKeys.get(ns);
  const base = slug(dict.get(text).en || text);
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`;
  taken.add(key);
  keyOfText.set(text, `${ns}.${key}`);
}

// ---------- placeholder names ----------

const FORMATTERS = new Set(["fmt", "format", "num", "number", "String", "Number", "round", "floor", "ceil", "abs", "max", "min", "toFixed", "toLocaleString", "gameName", "tr", "credits", "cr", "ly", "dist", "pct", "percent", "plural", "time", "date", "trim", "toUpperCase", "toLowerCase", "join"]);

function nameFromExpression(src) {
  const sf = ts.createSourceFile("x.ts", `(${src})`, ts.ScriptTarget.ES2022, true);
  let e = sf.statements[0]?.expression;
  const visit = (n) => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n))) n = n.expression;
    if (!n) return "value";
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (name === "length" || name === "size") return "count";
      return name;
    }
    if (ts.isElementAccessExpression(n)) return visit(n.expression);
    if (ts.isCallExpression(n)) {
      const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : ts.isIdentifier(n.expression) ? n.expression.text : "";
      if (FORMATTERS.has(callee)) {
        if (n.arguments.length) return visit(n.arguments[0]);
        if (ts.isPropertyAccessExpression(n.expression)) return visit(n.expression.expression);
      }
      if (callee === "filter" || callee === "map") return "count";
      return callee || "value";
    }
    if (ts.isConditionalExpression(n)) return visit(n.whenTrue) === visit(n.whenFalse) ? visit(n.whenTrue) : "value";
    if (ts.isBinaryExpression(n)) {
      if (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken) return visit(n.left);
      return "value";
    }
    return "value";
  };
  const raw = visit(e);
  const clean = raw.replace(/^_+/, "").replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
  return clean && /^[A-Za-z]/.test(clean) ? clean : "value";
}

const varsOfKey = new Map(); // key → [names] (index = placeholder number)
for (const hit of hits) {
  const key = keyOfText.get(hit.core);
  if (varsOfKey.has(key) || !hit.exprs.length) continue;
  const names = [];
  for (const expr of hit.exprs) {
    let name = nameFromExpression(expr);
    if (name === "t") name = "value";
    const base = name;
    for (let i = 2; names.includes(name); i++) name = `${base}${i}`;
    names.push(name);
  }
  varsOfKey.set(key, names);
}

// ---------- locale files ----------

function toI18next(text, names) {
  return text.replace(/\{(\d+)\}/g, (m, n) => (names && names[n] ? `{{${names[n]}}}` : m));
}

function buildLocales() {
  const out = Object.fromEntries(LANGS.map((l) => [l, {}]));
  for (const [text, fullKey] of keyOfText) {
    const [ns, key] = fullKey.split(".");
    const names = varsOfKey.get(fullKey);
    const row = dict.get(text);
    for (const lang of LANGS) {
      const value = row[lang] || (lang === "fr" ? text : "");
      if (!value) continue; // falls back to English at run time
      (out[lang][ns] ??= {})[key] = toI18next(value, names);
    }
  }
  // Stable order: namespaces then keys alphabetically.
  for (const lang of LANGS) {
    const sorted = {};
    for (const ns of Object.keys(out[lang]).sort()) {
      sorted[ns] = {};
      for (const k of Object.keys(out[lang][ns]).sort()) sorted[ns][k] = out[lang][ns][k];
    }
    out[lang] = sorted;
  }
  return out;
}

// ---------- source rewriting ----------

function rewriteFile(file, fileHits) {
  const abs = path.join(ROOT, file);
  let src = fs.readFileSync(abs, "utf8");
  fileHits.sort((a, b) => a.start - b.start || b.end - a.end);
  // Hits can be nested (a French text inside ${…} of another one): rebuild outer ones from inner ones.
  const contains = (o, i) => o !== i && o.start <= i.start && i.end <= o.end;
  const render = (from, to, inside) => {
    let text = "";
    let pos = from;
    for (const hit of inside.filter((x) => !inside.some((o) => contains(o, x)))) {
      text += src.slice(pos, hit.start) + replacement(hit, inside.filter((x) => contains(hit, x)));
      pos = hit.end;
    }
    return text + src.slice(pos, to);
  };
  const exprTexts = (hit, inner) => {
    // The ${…} spans of a template, with any nested hits replaced.
    const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true);
    let node;
    const find = (n) => {
      if (n.getStart(sf) === hit.start && n.getEnd() === hit.end && ts.isTemplateExpression(n)) node = n;
      else if (!node) ts.forEachChild(n, find);
    };
    find(sf);
    return node.templateSpans.map((span) => render(span.expression.getStart(sf), span.expression.getEnd(), inner.filter((x) => x.start >= span.expression.getStart(sf) && x.end <= span.expression.getEnd())));
  };
  const replacement = (hit, inner) => {
    const key = keyOfText.get(hit.core);
    let call;
    if (hit.exprs.length) {
      const names = varsOfKey.get(key);
      const exprs = exprTexts(hit, inner);
      const props = names.map((n, i) => (exprs[i].trim() === n ? n : `${n}: ${exprs[i].trim()}`));
      call = `t(${JSON.stringify(key)}, { ${props.join(", ")} })`;
    } else call = `t(${JSON.stringify(key)})`;
    if (!hit.lead && !hit.trail) return call;
    return `(${[hit.lead && JSON.stringify(hit.lead), call, hit.trail && JSON.stringify(hit.trail)].filter(Boolean).join(" + ")})`;
  };
  let out = render(0, src.length, fileHits);

  // import { t } from ".../i18n.js"
  const rel = path.relative(path.dirname(abs), path.join(ROOT, "src", "i18n.js")).replace(/\\/g, "/");
  const spec = rel.startsWith(".") ? rel : `./${rel}`;
  const importRe = new RegExp(`import \\{([^}]*)\\} from "${spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}";`);
  const m = importRe.exec(out);
  if (m) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.includes("t")) names.push("t");
    names.sort((a, b) => a.replace(/^type /, "").localeCompare(b.replace(/^type /, "")));
    out = out.replace(importRe, `import { ${names.join(", ")} } from "${spec}";`);
  } else {
    // After the last import (or the leading comment block).
    const imports = [...out.matchAll(/^import [^;]+;\n/gm)];
    const line = `import { t } from "${spec}";\n`;
    if (imports.length) {
      const last = imports[imports.length - 1];
      out = out.slice(0, last.index + last[0].length) + line + out.slice(last.index + last[0].length);
    } else {
      const header = /^(\/\/[^\n]*\n)*\n?/.exec(out)[0];
      out = header + line + (header.endsWith("\n\n") ? "" : "\n") + out.slice(header.length);
    }
  }
  return out;
}

// ---------- run ----------

const locales = buildLocales();
const counts = {};
for (const k of keyOfText.values()) counts[k.split(".")[0]] = (counts[k.split(".")[0]] ?? 0) + 1;
console.log("keys per namespace:", counts);
console.log("keys with variables:", varsOfKey.size);

if (!WRITE) {
  const sample = [...keyOfText.entries()].slice(0, 40).map(([fr, k]) => `${k}  ←  ${fr}  →  ${toI18next(dict.get(fr).en, varsOfKey.get(k))}`);
  console.log(sample.join("\n"));
  const odd = [...varsOfKey.entries()].filter(([, v]) => v.some((n) => /^value\d*$/.test(n)));
  console.log(`keys with a generic "value" variable: ${odd.length}`);
  for (const [k, v] of odd.slice(0, 30)) console.log("  ", k, v.join(","), "←", [...keyOfText].find(([, x]) => x === k)[0]);
} else {
  const byFile = {};
  for (const hit of hits) (byFile[hit.file] ??= []).push(hit);
  for (const [file, fileHits] of Object.entries(byFile)) fs.writeFileSync(path.join(ROOT, file), rewriteFile(file, fileHits));
  for (const lang of LANGS) fs.writeFileSync(path.join(ROOT, "public", "locales", `${lang}.json`), JSON.stringify(locales[lang], null, 2) + "\n");
  console.log(`rewrote ${Object.keys(byFile).length} files, wrote ${LANGS.length} locale files`);
}
