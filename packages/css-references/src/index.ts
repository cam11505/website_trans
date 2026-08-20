import postcss from 'postcss';
import valueParser, { type FunctionNode, type Node } from 'postcss-value-parser';

export type CssReferenceKind = 'import' | 'url';

export interface CssReference {
  kind: CssReferenceKind;
  value: string;
}

export interface RewriteCssReferencesResult {
  css: string;
  references: CssReference[];
  rewrittenReferenceCount: number;
}

export type CssReferenceReplacer = (reference: CssReference) => string | undefined;

function functionValue(node: FunctionNode): string | undefined {
  const significant = node.nodes.filter(
    (child) => child.type !== 'space' && child.type !== 'comment',
  );
  if (significant.length === 1 && significant[0]?.type === 'string') {
    return significant[0].value.trim();
  }
  const value = valueParser.stringify(node.nodes).trim();
  return value === '' ? undefined : value;
}

function replaceFunctionValue(node: FunctionNode, replacement: string): void {
  const existing = node.nodes.find(
    (child) => child.type !== 'space' && child.type !== 'comment',
  );
  if (existing?.type === 'string') {
    existing.value = replacement;
    node.nodes = [existing];
    return;
  }
  node.nodes = [
    {
      type: 'word',
      value: replacement,
      sourceIndex: 0,
      sourceEndIndex: replacement.length,
    },
  ];
}

function transformValue(
  input: string,
  kind: CssReferenceKind,
  replacer: CssReferenceReplacer,
  allowLeadingString: boolean,
): { value: string; references: CssReference[]; rewrittenReferenceCount: number } {
  const parsed = valueParser(input);
  const references: CssReference[] = [];
  let rewrittenReferenceCount = 0;

  if (allowLeadingString) {
    const first = parsed.nodes.find((node) => node.type !== 'space' && node.type !== 'comment');
    if (first?.type === 'string') {
      const reference = { kind, value: first.value.trim() } satisfies CssReference;
      if (reference.value !== '') {
        references.push(reference);
        const replacement = replacer(reference);
        if (replacement !== undefined && replacement !== reference.value) {
          first.value = replacement;
          rewrittenReferenceCount += 1;
        }
      }
    }
  }

  parsed.walk((node: Node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'url') {
      return undefined;
    }
    const value = functionValue(node);
    if (value === undefined) {
      return false;
    }
    const reference = { kind, value } satisfies CssReference;
    references.push(reference);
    const replacement = replacer(reference);
    if (replacement !== undefined && replacement !== value) {
      replaceFunctionValue(node, replacement);
      rewrittenReferenceCount += 1;
    }
    return false;
  });

  return { value: parsed.toString(), references, rewrittenReferenceCount };
}

export function rewriteCssReferences(
  css: string,
  replacer: CssReferenceReplacer,
): RewriteCssReferencesResult {
  const root = postcss.parse(css);
  const references: CssReference[] = [];
  let rewrittenReferenceCount = 0;

  root.walk((node) => {
    if (node.type === 'decl') {
      const transformed = transformValue(node.value, 'url', replacer, false);
      node.value = transformed.value;
      references.push(...transformed.references);
      rewrittenReferenceCount += transformed.rewrittenReferenceCount;
    } else if (node.type === 'atrule') {
      const kind = node.name.toLowerCase() === 'import' ? 'import' : 'url';
      const transformed = transformValue(
        node.params,
        kind,
        replacer,
        kind === 'import',
      );
      node.params = transformed.value;
      references.push(...transformed.references);
      rewrittenReferenceCount += transformed.rewrittenReferenceCount;
    }
  });

  return { css: root.toString(), references, rewrittenReferenceCount };
}

export function collectCssReferences(css: string): CssReference[] {
  return rewriteCssReferences(css, () => undefined).references;
}
