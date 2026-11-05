// Scans src/ with the TypeScript compiler and lists every UI text that has a translation in the
// old dictionaries (tools/translations_*.txt, French source → 5 languages), with where it sits:
// inside a function (can call t() directly) or at module scope (evaluated before the language is
// loaded: needs a lazy key). Shared by the dry run and the migration (migrate.cjs).

const fs = require("node:fs");
const path = require("node:path");
const ts = require(process.env.TS_LIB || "/opt/npm-tools/node_modules/typescript/lib/typescript.js");

const ROOT = path.resolve(__dirname, "..", "..");
const LANGS = ["fr", "en", "de", "es", "pt", "ru"];

/** French source text → { en, de, es, pt, ru } from the old "fr ¦ en ¦ de ¦ es ¦ pt ¦ ru" files. */
function loadDictionary() {
  const dict = new Map();
  for (const file of fs.readdirSync(path.join(ROOT, "tools")).filter((f) => /^translations_\d+\.txt$/.test(f)).sort()) {
    for (const line of fs.readFileSync(path.join(ROOT, "tools", file), "utf8").split("\n")) {
      if (!line.includes("¦") || line.startsWith("#")) continue;
      const cells = line.split("¦").map((c) => c.trim());
      if (cells.length < 6) continue;
      // Later files win, as in the old generator.
      dict.set(cells[0], Object.fromEntries(LANGS.map((l, i) => [l, cells[i]])));
    }
  }
  return dict;
}

/** All .ts files under src/. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(path.join(ROOT, "src"));
  return out.sort();
}

/** The literal's text with ${…} as {0}, {1}…, and the expressions in order. */
function literalText(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, exprs: [] };
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    const exprs = [];
    node.templateSpans.forEach((span, i) => {
      text += `{${i}}` + span.literal.text;
      exprs.push(span.expression.getText(sf));
    });
    return { text, exprs };
  }
  return null;
}

const insideFunction = (node) => {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration(p)) return true;
    // Class property initialisers run when the object is built (after the language is loaded).
    if (ts.isPropertyDeclaration(p) && !p.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) return true;
  }
  return false;
};

/** Literals that are never UI text: imports, type positions, object keys, log calls. */
function skipped(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  for (let a = node.parent; a; a = a.parent) {
    if (ts.isCallExpression(a)) {
      const callee = a.expression.getText();
      if (/^log\.(debug|info|warn|error)$|^logs?\b|^console\./.test(callee)) return true;
    }
    if (ts.isFunctionLike(a) || ts.isSourceFile(a)) break;
  }
  return false;
}

function scan() {
  const dict = loadDictionary();
  const hits = [];
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const visit = (node) => {
      const lit = literalText(node, sf);
      if (lit && !skipped(node)) {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(lit.text);
        const core = m[2];
        if (core && dict.has(core)) {
          hits.push({
            file: path.relative(ROOT, file),
            start: node.getStart(sf),
            end: node.getEnd(),
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            lead: m[1],
            trail: m[3],
            core,
            exprs: lit.exprs,
            inFunction: insideFunction(node),
            kind: ts.SyntaxKind[node.kind],
            parentKind: ts.SyntaxKind[node.parent.kind],
          });
        }
        if (!ts.isTemplateExpression(node)) return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { dict, hits };
}

module.exports = { scan, loadDictionary, sourceFiles, ROOT, LANGS, ts };

if (require.main === module) {
  const { dict, hits } = scan();
  const used = new Set(hits.map((h) => h.core));
  const byFile = {};
  for (const h of hits) byFile[h.file] = (byFile[h.file] ?? 0) + 1;
  console.log(`dictionary entries: ${dict.size}, used in code: ${used.size}, occurrences: ${hits.length}`);
  console.log(`in functions: ${hits.filter((h) => h.inFunction).length}, at module scope: ${hits.filter((h) => !h.inFunction).length}`);
  console.log(`with \${…}: ${hits.filter((h) => h.exprs.length).length}`);
  console.log("module-scope occurrences by file:");
  const ms = {};
  for (const h of hits.filter((h) => !h.inFunction)) ms[h.file] = (ms[h.file] ?? 0) + 1;
  console.log(ms);
  console.log("unused dictionary entries:", [...dict.keys()].filter((k) => !used.has(k)).length);
}
