import ts from 'typescript';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const fileListRaw = execSync("rg --files -g '*.ts' -g '*.tsx' -g '!**/node_modules/**' -g '!**/dist/**'", {
  cwd: root,
  encoding: 'utf8',
});

const files = fileListRaw
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)
  .map((file) => path.join(root, file));

const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  checkJs: false,
  skipLibCheck: true,
  strict: false,
  noEmit: true,
  types: ['node'],
});

const checker = program.getTypeChecker();

const functionLikeKinds = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
]);

function isStringOnly(type) {
  if (type.flags & ts.TypeFlags.StringLike) return true;

  if (type.isUnion()) {
    return type.types.every((part) => isStringOnly(part));
  }

  return false;
}

function getNodeLabel(node) {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
    return node.name ? node.name.getText() : '<anonymous>';
  }

  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }

    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }

    return '<anonymous>';
  }

  return '<unknown>';
}

const findings = [];

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile) continue;
  if (!sourceFile.fileName.startsWith(root)) continue;
  if (sourceFile.fileName.includes('node_modules')) continue;

  const visit = (node) => {
    if (functionLikeKinds.has(node.kind)) {
      const signature = checker.getSignatureFromDeclaration(node);
      if (signature) {
        const returnType = checker.getReturnTypeOfSignature(signature);
        if (!isStringOnly(returnType)) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          findings.push({
            file: path.relative(root, sourceFile.fileName),
            line: line + 1,
            col: character + 1,
            name: getNodeLabel(node),
            returnType: checker.typeToString(returnType),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

findings.sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

console.log(`Scanned files: ${files.length}`);
console.log(`Non-string return signatures: ${findings.length}`);

for (const finding of findings) {
  console.log(`${finding.file}:${finding.line}:${finding.col} ${finding.name} -> ${finding.returnType}`);
}

if (findings.length > 0) {
  process.exitCode = 1;
}
