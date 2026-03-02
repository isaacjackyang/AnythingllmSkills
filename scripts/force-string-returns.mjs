import ts from 'typescript';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const list = execSync("rg --files -g '*.ts' -g '*.tsx' -g '!**/node_modules/**' -g '!**/dist/**'", { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('reports/'));

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const isFunctionLike = (node) => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node);

function typeNodeFor(asyncFlag) {
  return asyncFlag
    ? ts.factory.createTypeReferenceNode('Promise', [ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)])
    : ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
}

const wrapString = (expr) => ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [expr]);

function transformBody(body, ctx) {
  const visitor = (node) => {
    if (isFunctionLike(node)) return node;
    if (ts.isReturnStatement(node)) {
      if (!node.expression) return ts.factory.updateReturnStatement(node, ts.factory.createStringLiteral(''));
      return ts.factory.updateReturnStatement(node, wrapString(node.expression));
    }
    return ts.visitEachChild(node, visitor, ctx);
  };

  const visited = ts.visitEachChild(body, visitor, ctx);
  const stmts = [...visited.statements];
  const last = stmts[stmts.length - 1];
  if (!last || !ts.isReturnStatement(last)) {
    stmts.push(ts.factory.createReturnStatement(ts.factory.createStringLiteral('')));
  }
  return ts.factory.updateBlock(visited, stmts);
}

for (const rel of list) {
  const full = path.join(root, rel);
  const source = fs.readFileSync(full, 'utf8');
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const transformer = (ctx) => {
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node)) {
        const asyncFlag = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, typeNodeFor(asyncFlag), node.body ? transformBody(node.body, ctx) : node.body);
      }
      if (ts.isMethodDeclaration(node)) {
        const asyncFlag = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        return ts.factory.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, typeNodeFor(asyncFlag), node.body ? transformBody(node.body, ctx) : node.body);
      }
      if (ts.isGetAccessorDeclaration(node)) {
        return ts.factory.updateGetAccessorDeclaration(node, node.modifiers, node.name, node.parameters, typeNodeFor(false), node.body ? transformBody(node.body, ctx) : node.body);
      }
      if (ts.isFunctionExpression(node)) {
        const asyncFlag = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        return ts.factory.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, typeNodeFor(asyncFlag), transformBody(node.body, ctx));
      }
      if (ts.isArrowFunction(node)) {
        const asyncFlag = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        const body = ts.isBlock(node.body) ? transformBody(node.body, ctx) : wrapString(node.body);
        return ts.factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, typeNodeFor(asyncFlag), node.equalsGreaterThanToken, body);
      }
      return ts.visitEachChild(node, visit, ctx);
    };
    return (node) => ts.visitNode(node, visit);
  };

  const result = ts.transform(sf, [transformer]);
  const out = result.transformed[0];
  result.dispose();
  fs.writeFileSync(full, printer.printFile(out));
}

console.log(`Processed ${list.length} files`);
