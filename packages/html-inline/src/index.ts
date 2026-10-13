import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import {
  inlinePlainText,
  MAX_INLINE_DEPTH,
  resolveInlineLink,
  type InlineNode,
  type MigrationWarning,
} from '@site-rescue/content-schema';

export function sourceId($: CheerioAPI, node: AnyNode): { id?: string } {
  const element = $(node);
  const id = element.attr('id') || (element.is('a') ? element.attr('name') : undefined);
  return id === undefined || id === '' ? {} : { id };
}

export function parseInlineContent(
  $: CheerioAPI,
  nodes: readonly AnyNode[],
  pageUrl: string,
  warnings: MigrationWarning[],
  depth = 0,
): InlineNode[] {
  const warn = (code: string, message: string): void => {
    warnings.push({ code, message, sourceUrl: pageUrl });
  };
  return nodes.flatMap((node): InlineNode[] => {
    if (node.type === 'text') {
      const value = node.data.replace(/[\t\n\r\f ]+/gu, ' ');
      return value === '' ? [] : [{ type: 'text', value }];
    }
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') {
      return [];
    }
    const tag = (node as Element).name.toLowerCase();
    const element = $(node);
    const id = sourceId($, node);
    if (['script', 'style', 'noscript', 'iframe', 'object', 'svg', 'math', 'img'].includes(tag)) {
      warn('unsupported-inline-content', `Inline <${tag}> content was omitted from text; review the source element before deployment.`);
      return [];
    }
    if (tag === 'br') {
      return [{ type: 'lineBreak', ...id }];
    }
    if (tag === 'code') {
      return [{ type: 'code', value: element.text(), ...id }];
    }
    if (depth >= MAX_INLINE_DEPTH) {
      warn('inline-content-flattened', `Inline nesting exceeds ${MAX_INLINE_DEPTH} levels; deeper formatting was flattened. Review the source content.`);
      const value = element.clone().find('script, style, noscript, iframe, object, svg, math').remove().end().text();
      return value === '' ? [] : [{ type: 'text', value }];
    }
    const children = parseInlineContent($, element.contents().toArray(), pageUrl, warnings, depth + 1);
    if (tag === 'a') {
      const target = element.attr('href');
      if (target !== undefined) {
        const href = resolveInlineLink(target, pageUrl);
        if (href !== undefined) {
          return [{ type: 'link', href, children, ...id }];
        }
        warn('unsafe-inline-link', 'An unsafe or unsupported inline link target was removed; its readable content was retained. Review the source link before deployment.');
      }
    } else if (tag === 'strong' || tag === 'b') {
      return [{ type: 'strong', children, ...id }];
    } else if (tag === 'em' || tag === 'i') {
      return [{ type: 'emphasis', children, ...id }];
    } else if (tag !== 'span' && tag !== 'li') {
      warn('inline-content-flattened', `Unsupported inline <${tag}> semantics were flattened while retaining readable content. Review the source formatting.`);
    }
    return id.id === undefined ? children : [{ type: 'span', children, ...id }];
  });
}

export function parseTextContent(
  $: CheerioAPI,
  nodes: readonly AnyNode[],
  pageUrl: string,
  warnings: MigrationWarning[],
): { text: string; inlines?: InlineNode[] } {
  const inlines = parseInlineContent($, nodes, pageUrl, warnings);
  return {
    text: inlinePlainText(inlines),
    ...(inlines.some((node) => node.type !== 'text') ? { inlines } : {}),
  };
}

export function parseListContent(
  $: CheerioAPI,
  node: AnyNode,
  pageUrl: string,
  warnings: MigrationWarning[],
): { items: string[]; itemInlines?: InlineNode[][] } {
  const itemInlines = $(node).children('li').toArray()
    .map((item) => parseInlineContent($, [item], pageUrl, warnings))
    .filter((nodes) => inlinePlainText(nodes) !== '' || nodes.some((child) => child.type !== 'text'));
  return {
    items: itemInlines.map(inlinePlainText),
    ...(itemInlines.some((nodes) => nodes.some((child) => child.type !== 'text')) ? { itemInlines } : {}),
  };
}
