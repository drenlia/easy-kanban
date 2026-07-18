#!/usr/bin/env node
/**
 * Static audit for JS identifier / route / import bugs left by camelCase↔lowercase rewrites.
 *
 * Catches (without running the app):
 *  1. Mangled imports:  import * as "foo" / { x as "y" }
 *  2. Express route params folded while handlers read camelCase (or vice versa)
 *  3. Scope mismatches via Acorn AST: param/binding `taskId` but free use of `taskid`
 *     (and the reverse) — the class of bug that crashed join-board / batch-update / reporting
 *  4. Syntax errors (parse failures)
 *
 * Usage:
 *   node scripts/audit-js-identifiers.js
 *   npm run audit:js
 *
 * Exit 1 if blocking issues found.
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const acorn = require('acorn');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER_DIR = join(ROOT, 'server');

const PAIRS = [
  ['boardId', 'boardid'],
  ['taskId', 'taskid'],
  ['columnId', 'columnid'],
  ['memberId', 'memberid'],
  ['userId', 'userid'],
  ['tagId', 'tagid'],
  ['commentId', 'commentid'],
  ['authorId', 'authorid'],
  ['requesterId', 'requesterid'],
  ['sprintId', 'sprintid'],
  ['roleId', 'roleid'],
  ['priorityId', 'priorityid'],
];

const camelToFolded = Object.fromEntries(PAIRS);
const foldedToCamel = Object.fromEntries(PAIRS.map(([c, f]) => [f, c]));
const ALL_NAMES = new Set([...Object.keys(camelToFolded), ...Object.keys(foldedToCamel)]);

const EXCLUDE = [/node_modules/, /\.test\.js$/, /scripts\/generate-qa/];

async function walkJs(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (EXCLUDE.some((r) => r.test(p))) continue;
    if (e.isDirectory()) await walkJs(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function snippetAt(text, index) {
  const line = text.split('\n')[lineOf(text, index) - 1] || '';
  return line.trim().slice(0, 120);
}

/** 1. Mangled import/export aliases */
function auditMangledImports(text, rel) {
  const issues = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!/\b(import|export)\b/.test(line)) return;
    if (/\bas\s+"[a-zA-Z_][a-zA-Z0-9_]*"/.test(line) || /import\s+\*\s+as\s+"/.test(line)) {
      issues.push({
        file: rel,
        line: i + 1,
        kind: 'mangled_import',
        message: 'Quoted import/export alias is invalid JS',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return issues;
}

/** 2. Route path :taskid vs req.params.taskId */
function auditRouteParams(text, rel) {
  const issues = [];
  const routeRe = /router\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/gi;
  let m;
  while ((m = routeRe.exec(text))) {
    const path = m[2];
    const routeLine = lineOf(text, m.index);
    // Look ahead ~40 lines for destructuring of req.params
    const after = text.slice(m.index, m.index + 2500);
    const dest = after.match(/\{\s*([^}]+)\s*\}\s*=\s*req\.params/);
    if (!dest) continue;
    const destNames = dest[1].split(',').map((s) => s.trim().split(/\s+as\s+|\s*=\s*/)[0].trim()).filter(Boolean);
    const pathParams = [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]);

    for (const pp of pathParams) {
      if (!ALL_NAMES.has(pp)) continue;
      const mate = camelToFolded[pp] || foldedToCamel[pp];
      if (!mate) continue;
      // If path has folded and dest has camel (or reverse) without the path form → bug
      if (foldedToCamel[pp] && destNames.includes(foldedToCamel[pp]) && !destNames.includes(pp)) {
        issues.push({
          file: rel,
          line: routeLine,
          kind: 'route_param_mismatch',
          message: `Route :${pp} but req.params destructures ${foldedToCamel[pp]} (Express keys match the path literal)`,
          snippet: snippetAt(text, m.index),
        });
      }
      if (camelToFolded[pp] && destNames.includes(camelToFolded[pp]) && !destNames.includes(pp)) {
        issues.push({
          file: rel,
          line: routeLine,
          kind: 'route_param_mismatch',
          message: `Route :${pp} but req.params destructures ${camelToFolded[pp]}`,
          snippet: snippetAt(text, m.index),
        });
      }
    }
  }
  return issues;
}

/**
 * Walk Acorn AST collecting binding names per scope, then find Identifier uses
 * of the mate name when the binding exists and the mate is not bound.
 */
function auditScopeMismatches(text, rel) {
  const issues = [];
  let ast;
  try {
    ast = acorn.parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowHashBang: true,
    });
  } catch (err) {
    issues.push({
      file: rel,
      line: err.loc?.line || 1,
      kind: 'syntax_error',
      message: err.message,
      snippet: '',
    });
    return issues;
  }

  // Build parent links
  const parents = new Map();
  (function link(node, parent) {
    parents.set(node, parent);
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && link(c, node));
        else if (typeof child.type === 'string') link(child, node);
      }
    }
  })(ast, null);

  function isScopeNode(n) {
    return (
      n.type === 'Program' ||
      n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression' ||
      n.type === 'BlockStatement' ||
      n.type === 'CatchClause'
    );
  }

  function enclosingScopes(node) {
    const scopes = [];
    let cur = node;
    while (cur) {
      if (isScopeNode(cur)) scopes.push(cur);
      cur = parents.get(cur);
    }
    return scopes;
  }

  // Map scope node → Set of bound names
  const bindings = new Map();

  function addBinding(scope, name) {
    if (!ALL_NAMES.has(name)) return;
    if (!bindings.has(scope)) bindings.set(scope, new Set());
    bindings.get(scope).add(name);
  }

  function collectPattern(scope, pattern) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') addBinding(scope, pattern.name);
    else if (pattern.type === 'AssignmentPattern') collectPattern(scope, pattern.left);
    else if (pattern.type === 'RestElement') collectPattern(scope, pattern.argument);
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((el) => collectPattern(scope, el));
    else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties) {
        if (prop.type === 'RestElement') collectPattern(scope, prop.argument);
        else collectPattern(scope, prop.value);
      }
    }
  }

  (function collectBindings(node) {
    if (!node || typeof node.type !== 'string') return;

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      const scope = node;
      if (node.type === 'FunctionDeclaration' && node.id) addBinding(scope, node.id.name);
      for (const p of node.params || []) collectPattern(scope, p);
    }

    if (node.type === 'VariableDeclarator') {
      // bind to nearest Block/Program/Function
      let scope = parents.get(node);
      while (scope && !isScopeNode(scope)) scope = parents.get(scope);
      if (scope) collectPattern(scope, node.id);
    }

    if (node.type === 'CatchClause' && node.param) {
      collectPattern(node, node.param);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && collectBindings(c));
      else if (child && typeof child.type === 'string') collectBindings(child);
    }
  })(ast);

  function isBoundInScopes(scopes, name) {
    for (const s of scopes) {
      if (bindings.get(s)?.has(name)) return true;
    }
    return false;
  }

  function isDeclarationId(node) {
    const p = parents.get(node);
    if (!p) return false;
    if (p.type === 'VariableDeclarator' && p.id === node) return true;
    if (p.type === 'FunctionDeclaration' && p.id === node) return true;
    if ((p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression' || p.type === 'FunctionDeclaration') &&
        (p.params || []).some((param) => {
          // param is the identifier or contains it
          let found = false;
          (function walk(n) {
            if (!n || found) return;
            if (n === node) found = true;
            for (const k of Object.keys(n)) {
              const c = n[k];
              if (c === node) found = true;
              else if (c && typeof c.type === 'string') walk(c);
              else if (Array.isArray(c)) c.forEach(walk);
            }
          })(param);
          return found;
        })) return true;
    if (p.type === 'Property' && p.key === node && !p.computed) return true; // { boardId } shorthand key ok
    if (p.type === 'MemberExpression' && p.property === node && !p.computed) return true; // obj.boardId
    if (p.type === 'LabelledStatement' && p.label === node) return true;
    return false;
  }

  (function visitIdents(node) {
    if (!node || typeof node.type !== 'string') return;

    if (node.type === 'Identifier' && ALL_NAMES.has(node.name) && !isDeclarationId(node)) {
      const name = node.name;
      const mate = camelToFolded[name] || foldedToCamel[name];
      if (!mate) {
        // continue walk
      } else {
        const scopes = enclosingScopes(node);
        const nameBound = isBoundInScopes(scopes, name);
        const mateBound = isBoundInScopes(scopes, mate);

        // Classic bug: mate is bound (param boardid) but we reference boardId unbound
        // OR: boardId is bound but we reference boardid unbound
        if (!nameBound && mateBound) {
          issues.push({
            file: rel,
            line: node.loc?.start?.line || lineOf(text, node.start),
            kind: 'identifier_mismatch',
            message: `Uses '${name}' but scope binds '${mate}' (likely rewrite bug → ReferenceError at runtime)`,
            snippet: snippetAt(text, node.start),
          });
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && visitIdents(c));
      else if (child && typeof child.type === 'string') visitIdents(child);
    }
  })(ast);

  return issues;
}

async function main() {
  const files = await walkJs(SERVER_DIR);
  const all = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const rel = relative(ROOT, file);
    all.push(...auditMangledImports(text, rel));
    all.push(...auditRouteParams(text, rel));
    all.push(...auditScopeMismatches(text, rel));
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const iss of all) {
    const k = `${iss.file}:${iss.line}:${iss.kind}:${iss.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(iss);
  }

  const byKind = {};
  for (const iss of unique) {
    byKind[iss.kind] = (byKind[iss.kind] || 0) + 1;
  }

  console.log(`Scanned ${files.length} server JS files`);
  console.log(`Issues: ${unique.length}`);
  for (const [k, n] of Object.entries(byKind).sort()) {
    console.log(`  ${k}: ${n}`);
  }
  console.log('');

  for (const iss of unique) {
    console.log(`${iss.file}:${iss.line} [${iss.kind}] ${iss.message}`);
    if (iss.snippet) console.log(`  ${iss.snippet}`);
  }

  if (unique.length) {
    console.log('\nFAIL — fix identifier/route/import mismatches (or adjust the auditor if a hit is intentional)');
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
