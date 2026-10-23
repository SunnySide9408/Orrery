import ts from 'typescript';
import type { NodeKind, ProviderScope } from '@orrery/contracts';

/** One `import` or `export ... from` in a file. */
export interface ImportFact {
  specifier: string;
  line: number;
  /** Local names bound by the import, used to match standalone `imports: [...]`. */
  names: readonly string[];
}

/** A `loadComponent` or `loadChildren` dynamic import. */
export interface LazyRouteFact {
  specifier: string;
  line: number;
}

/** A class listed in a decorator's `imports: [...]` array. */
export interface StandaloneImportFact {
  name: string;
  line: number;
}

/** A class or token asked for through dependency injection. */
export interface InjectionFact {
  name: string;
  line: number;
}

/** A class or token listed in a `providers` array, or the file's own `providedIn`. */
export interface ProviderFact {
  name: string;
  scope: ProviderScope;
  line: number;
}

/** Everything the analyser needs from one file, read from its syntax tree only. */
export interface FileFacts {
  kind: NodeKind;
  /** The main exported class or function, or `null` to fall back to the file name. */
  name: string | null;
  linesOfCode: number;
  imports: readonly ImportFact[];
  lazyRoutes: readonly LazyRouteFact[];
  standaloneImports: readonly StandaloneImportFact[];
  /** `inject(X)` calls and constructor parameters typed `X` or marked `@Inject(X)`. */
  injections: readonly InjectionFact[];
  /** Entries of `providers` and `viewProviders` arrays, and `@Injectable({ providedIn })`. */
  providers: readonly ProviderFact[];
  /** Classes declared in this file, so a provider listed next to its class resolves to it. */
  classNames: readonly string[];
}

const ANGULAR_CORE = '@angular/core';

/** Class decorators from `@angular/core`, strongest first when a file has several. */
const DECORATOR_KINDS: readonly (readonly [string, NodeKind])[] = [
  ['Component', 'component'],
  ['Directive', 'directive'],
  ['Pipe', 'pipe'],
  ['NgModule', 'module'],
  ['Injectable', 'service'],
];

/** Interfaces that turn an `@Injectable` class into a more specific kind. */
const IMPLEMENTS_KINDS: Readonly<Record<string, NodeKind>> = {
  CanActivate: 'guard',
  CanActivateChild: 'guard',
  CanDeactivate: 'guard',
  CanMatch: 'guard',
  CanLoad: 'guard',
  HttpInterceptor: 'interceptor',
  Resolve: 'resolver',
};

/** Type annotations that mark a variable as a functional guard, interceptor, resolver or route list. */
const TYPE_KINDS: Readonly<Record<string, NodeKind>> = {
  CanActivateFn: 'guard',
  CanActivateChildFn: 'guard',
  CanDeactivateFn: 'guard',
  CanMatchFn: 'guard',
  HttpInterceptorFn: 'interceptor',
  ResolveFn: 'resolver',
  Routes: 'route-config',
};

/** Decorator properties whose array lists standalone or module imports. */
const IMPORT_ARRAY_DECORATORS = new Set(['Component', 'Directive', 'NgModule']);

/** `providedIn` values written as strings. */
const PROVIDED_IN_SCOPES: Readonly<Record<string, ProviderScope>> = {
  root: 'root',
  platform: 'platform',
  any: 'any',
};

/** Object properties that make an object literal a route. */
const ROUTE_PROPERTIES = new Set([
  'path',
  'loadChildren',
  'loadComponent',
  'children',
  'component',
]);

/**
 * Reads the Angular facts of one file. It only parses: no type checker, no
 * program, nothing executed. That keeps it fast and identical in Node and in a
 * Web Worker, and its limits are explicit (see docs/decisions/0005).
 */
export function parseFile(path: string, text: string): FileFacts {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const imports: ImportFact[] = [];
  const lazyRoutes: LazyRouteFact[] = [];
  const standaloneImports: StandaloneImportFact[] = [];
  const injections: InjectionFact[] = [];
  const providers: ProviderFact[] = [];
  const classNames: string[] = [];
  const spec = isSpecPath(path);
  /** Local names imported from `@angular/core`, mapped to their exported name. */
  const angularCore = new Map<string, string>();

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const names = importedNames(statement.importClause);
      imports.push({ specifier, line: lineOf(statement), names: names.map(([local]) => local) });
      if (specifier === ANGULAR_CORE) {
        for (const [local, exported] of names) angularCore.set(local, exported);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.push({
        specifier: statement.moduleSpecifier.text,
        line: lineOf(statement),
        names: [],
      });
    }
  }

  let decoratedKind: { kind: NodeKind; rank: number; name: string | null } | null = null;
  let typedKind: { kind: NodeKind; name: string } | null = null;
  let firstExport: string | null = null;

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      const className = node.name?.text ?? null;
      if (className) classNames.push(className);
      if (firstExport === null && className && isExported(node)) firstExport = className;

      for (const decorator of ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []) {
        const call = decorator.expression;
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue;
        const decoratorName = angularCore.get(call.expression.text);
        if (decoratorName === undefined) continue;

        const rank = DECORATOR_KINDS.findIndex(([name]) => name === decoratorName);
        if (rank === -1) continue;
        let kind = DECORATOR_KINDS[rank]![1];
        if (kind === 'service') kind = implementedKind(node) ?? kind;
        if (decoratedKind === null || rank < decoratedKind.rank) {
          decoratedKind = { kind, rank, name: className };
        }

        if (IMPORT_ARRAY_DECORATORS.has(decoratorName)) {
          for (const element of arrayProperty(call, 'imports')) {
            if (ts.isIdentifier(element)) {
              standaloneImports.push({ name: element.text, line: lineOf(element) });
            }
          }
        }
        if (decoratorName === 'Injectable' && className) {
          const providedIn = objectProperty(call, 'providedIn');
          const scope = providedIn && providedInScope(providedIn);
          if (scope) providers.push({ name: className, scope, line: lineOf(decorator) });
        }
      }
    } else if (ts.isConstructorDeclaration(node)) {
      for (const parameter of node.parameters) {
        const name = injectedParameter(parameter, angularCore);
        if (name) injections.push({ name, line: lineOf(parameter) });
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      angularCore.get(node.expression.text) === 'inject' &&
      node.arguments[0] &&
      ts.isIdentifier(node.arguments[0])
    ) {
      injections.push({ name: node.arguments[0].text, line: lineOf(node) });
    } else if (
      !spec &&
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === 'providers' || node.name.text === 'viewProviders') &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      // Test modules (`TestBed.configureTestingModule`) are not app providers, hence `!spec`.
      const scope = providersScope(node, angularCore);
      for (const element of node.initializer.elements) {
        const name = providedName(element);
        if (name) providers.push({ name, scope, line: lineOf(element) });
      }
    } else if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      firstExport ??= node.name.text;
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        if (firstExport === null && isExported(node)) firstExport = declaration.name.text;
        const kind = typedVariableKind(declaration.type);
        if (kind && typedKind === null) typedKind = { kind, name: declaration.name.text };
      }
    } else if (isDynamicImport(node)) {
      const specifier = (node.arguments[0] as ts.StringLiteralLike).text;
      if (isLazyRouteLoader(node)) {
        lazyRoutes.push({ specifier, line: lineOf(node) });
      } else {
        imports.push({ specifier, line: lineOf(node), names: [] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const decorated = decoratedKind as { kind: NodeKind; name: string | null } | null;
  const typed = typedKind as { kind: NodeKind; name: string } | null;
  let kind: NodeKind = decorated?.kind ?? typed?.kind ?? 'other';
  let name = decorated?.name ?? (typed && typed.kind !== 'route-config' ? typed.name : null);
  if (isSpecPath(path)) {
    kind = 'spec';
    name = null;
  }

  return {
    kind,
    name: name ?? (kind === 'spec' || kind === 'route-config' ? null : firstExport),
    linesOfCode: text.split(/\r?\n/).filter((line) => line.trim() !== '').length,
    imports,
    lazyRoutes,
    standaloneImports,
    injections,
    providers,
    classNames,
  };
}

export function isSpecPath(path: string): boolean {
  return /\.spec\.ts$/.test(path);
}

/** `[local, exported]` pairs for every binding an import clause creates. */
function importedNames(clause: ts.ImportClause | undefined): [string, string][] {
  if (!clause) return [];
  const names: [string, string][] = [];
  if (clause.name) names.push([clause.name.text, 'default']);
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    names.push([bindings.name.text, '*']);
  } else if (bindings) {
    for (const element of bindings.elements) {
      names.push([element.name.text, (element.propertyName ?? element.name).text]);
    }
  }
  return names;
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function implementedKind(node: ts.ClassDeclaration): NodeKind | null {
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
    for (const type of clause.types) {
      if (ts.isIdentifier(type.expression)) {
        const kind = IMPLEMENTS_KINDS[type.expression.text];
        if (kind) return kind;
      }
    }
  }
  return null;
}

/** `Routes`, `Route[]`, `CanActivateFn`, … as written in a variable's type annotation. */
function typedVariableKind(type: ts.TypeNode | undefined): NodeKind | null {
  if (!type) return null;
  if (ts.isArrayTypeNode(type)) {
    const element = type.elementType;
    return ts.isTypeReferenceNode(element) &&
      ts.isIdentifier(element.typeName) &&
      element.typeName.text === 'Route'
      ? 'route-config'
      : null;
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return TYPE_KINDS[type.typeName.text] ?? null;
  }
  return null;
}

function arrayProperty(call: ts.CallExpression, property: string): readonly ts.Expression[] {
  const options = call.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return [];
  for (const member of options.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === property &&
      ts.isArrayLiteralExpression(member.initializer)
    ) {
      return member.initializer.elements;
    }
  }
  return [];
}

function objectProperty(call: ts.CallExpression, property: string): ts.Expression | null {
  const options = call.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return null;
  for (const member of options.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === property
    ) {
      return member.initializer;
    }
  }
  return null;
}

/** `'root'`, `'platform'`, `'any'`, or a module class. */
function providedInScope(value: ts.Expression): ProviderScope | null {
  if (ts.isStringLiteralLike(value)) return PROVIDED_IN_SCOPES[value.text] ?? null;
  return ts.isIdentifier(value) ? 'module' : null;
}

/**
 * What a constructor parameter asks the injector for: the `@Inject(X)` token
 * when there is one, else the class in its type annotation. Generic and
 * union types are skipped; without a type checker they cannot be read safely.
 */
function injectedParameter(
  parameter: ts.ParameterDeclaration,
  angularCore: ReadonlyMap<string, string>,
): string | null {
  for (const decorator of ts.canHaveDecorators(parameter)
    ? (ts.getDecorators(parameter) ?? [])
    : []) {
    const call = decorator.expression;
    if (
      ts.isCallExpression(call) &&
      ts.isIdentifier(call.expression) &&
      angularCore.get(call.expression.text) === 'Inject'
    ) {
      const token = call.arguments[0];
      return token && ts.isIdentifier(token) ? token.text : null;
    }
  }
  const type = parameter.type;
  return type &&
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName) &&
    !type.typeArguments
    ? type.typeName.text
    : null;
}

/** Where a `providers: [...]` array sits decides the scope of what it provides. */
function providersScope(
  assignment: ts.PropertyAssignment,
  angularCore: ReadonlyMap<string, string>,
): ProviderScope {
  const options = assignment.parent;
  const call = options.parent;
  if (
    call &&
    ts.isCallExpression(call) &&
    ts.isDecorator(call.parent) &&
    ts.isIdentifier(call.expression)
  ) {
    const decorator = angularCore.get(call.expression.text);
    if (decorator === 'NgModule') return 'module';
    if (decorator === 'Component' || decorator === 'Directive') return 'component';
  }
  const isRoute = options.properties.some(
    (member) =>
      ts.isPropertyAssignment(member) &&
      ts.isIdentifier(member.name) &&
      ROUTE_PROPERTIES.has(member.name.text),
  );
  return isRoute ? 'route' : 'application';
}

/** `X` or `{ provide: X, … }`; factory calls such as `provideHttpClient()` are skipped. */
function providedName(element: ts.Expression): string | null {
  if (ts.isIdentifier(element)) return element.text;
  if (!ts.isObjectLiteralExpression(element)) return null;
  for (const member of element.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'provide' &&
      ts.isIdentifier(member.initializer)
    ) {
      return member.initializer.text;
    }
  }
  return null;
}

function isDynamicImport(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0]!)
  );
}

/** True when the `import()` sits inside `loadComponent: () => …` or `loadChildren: () => …`. */
function isLazyRouteLoader(node: ts.CallExpression): boolean {
  for (let current: ts.Node = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      return (
        ts.isIdentifier(current.name) &&
        (current.name.text === 'loadComponent' || current.name.text === 'loadChildren')
      );
    }
    if (ts.isSourceFile(current) || ts.isClassDeclaration(current)) return false;
  }
  return false;
}
