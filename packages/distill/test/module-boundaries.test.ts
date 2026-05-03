import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ImportReference = {
    readonly file: string;
    readonly line: number;
    readonly specifier: string;
};

const sourceRoot = resolve("src");

const collectSourceFiles = (directory: string): readonly string[] => {
    const files: string[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...collectSourceFiles(entryPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".ts")) {
            files.push(entryPath);
        }
    }

    return files;
};

const moduleRootForPath = (filePath: string): string => {
    const parts = relative(sourceRoot, filePath).split(sep);

    return parts.length === 1 ? "" : parts[0];
};

const isModuleFacadePath = (filePath: string): boolean => {
    const parts = relative(sourceRoot, filePath).split(sep);

    return parts.length === 2 && parts[1] === "index";
};

const isModuleFacadeFile = (filePath: string): boolean => {
    const parts = relative(sourceRoot, filePath).split(sep);

    return parts.length === 2 && parts[1] === "index.ts";
};

const collectImportReferences = (filePath: string): readonly ImportReference[] => {
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const references: ImportReference[] = [];

    const addReference = (specifier: string, position: number): void => {
        const { line } = sourceFile.getLineAndCharacterOfPosition(position);

        references.push({
            file: relative(process.cwd(), filePath),
            line: line + 1,
            specifier,
        });
    };

    const visit = (node: ts.Node): void => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteralLike(node.moduleSpecifier)
        ) {
            addReference(node.moduleSpecifier.text, node.moduleSpecifier.getStart(sourceFile));
        }

        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteralLike(node.arguments[0])
        ) {
            addReference(node.arguments[0].text, node.arguments[0].getStart(sourceFile));
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return references;
};

describe("module boundaries", () => {
    it("keeps module index files as re-export-only facades", () => {
        const violations: string[] = [];

        for (const filePath of collectSourceFiles(sourceRoot).filter(isModuleFacadeFile)) {
            const sourceText = readFileSync(filePath, "utf8");
            const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

            const sourceModule = moduleRootForPath(filePath);

            for (const statement of sourceFile.statements) {
                const moduleSpecifier = ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
                const targetPath =
                    moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)
                        ? resolve(dirname(filePath), moduleSpecifier.text)
                        : undefined;

                if (targetPath && moduleRootForPath(targetPath) === sourceModule) {
                    continue;
                }

                const { line } = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));

                violations.push(`${relative(process.cwd(), filePath)}:${line + 1}`);
            }
        }

        expect(violations).toEqual([]);
    });

    it("imports other src modules only through their index facade", () => {
        const violations: string[] = [];

        for (const filePath of collectSourceFiles(sourceRoot)) {
            const sourceModule = moduleRootForPath(filePath);

            for (const reference of collectImportReferences(filePath)) {
                if (!reference.specifier.startsWith(".")) {
                    continue;
                }

                const targetPath = resolve(dirname(filePath), reference.specifier);
                const targetModule = moduleRootForPath(targetPath);

                if (sourceModule !== targetModule && !isModuleFacadePath(targetPath)) {
                    violations.push(`${reference.file}:${reference.line} -> ${reference.specifier}`);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
