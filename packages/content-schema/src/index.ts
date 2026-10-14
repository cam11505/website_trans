import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = '1.1.0' as const;
export const siteSchemaVersionSchema = z.enum(['1.0.0', CURRENT_SCHEMA_VERSION]);
export const MAX_INLINE_DEPTH = 32;

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; id?: string }
  | { type: 'lineBreak'; id?: string }
  | { type: 'link'; href: string; children: InlineNode[]; id?: string }
  | { type: 'strong' | 'emphasis' | 'span'; children: InlineNode[]; id?: string };

export function resolveInlineLink(value: string, baseUrl: string): string | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  try {
    const url = new URL(value, baseUrl);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function inlinePlainText(nodes: readonly InlineNode[]): string {
  const text = (node: InlineNode): string => {
    if (node.type === 'text' || node.type === 'code') {
      return node.value;
    }
    return node.type === 'lineBreak' ? '\n' : node.children.map(text).join('');
  };
  return nodes.map(text).join('').replace(/\s+/gu, ' ').trim();
}

function makeInlineNodeSchema(depth: number): z.ZodType<InlineNode> {
  return z.lazy(() => {
    const children = depth >= MAX_INLINE_DEPTH
      ? z.array(z.never())
      : z.array(makeInlineNodeSchema(depth + 1));
    const id = z.string().min(1).optional();
    return z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), value: z.string() }).strict(),
      z.object({ type: z.literal('code'), value: z.string(), id }).strict(),
      z.object({ type: z.literal('lineBreak'), id }).strict(),
      z.object({ type: z.literal('link'), href: z.string().min(1).refine(
        (value) => resolveInlineLink(value, 'https://inline-validation.invalid/') !== undefined,
        'Unsafe or unsupported inline link target.',
      ), children, id }).strict(),
      z.object({ type: z.literal('strong'), children, id }).strict(),
      z.object({ type: z.literal('emphasis'), children, id }).strict(),
      z.object({ type: z.literal('span'), children, id }).strict(),
    ]);
  });
}

export const inlineNodeSchema = makeInlineNodeSchema(0);

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  inlines?: InlineNode[];
  id?: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
  inlines?: InlineNode[];
  id?: string;
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
}

export interface GalleryBlock {
  type: 'gallery';
  images: ImageBlock[];
}

export interface ButtonBlock {
  type: 'button';
  label: string;
  href: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
  itemInlines?: InlineNode[][];
  id?: string;
}

export interface ColumnsBlock {
  type: 'columns';
  columns: ContentBlock[][];
}

export interface DividerBlock {
  type: 'divider';
}

export interface VideoBlock {
  type: 'video';
  src: string;
  poster?: string;
}

export interface EmbedBlock {
  type: 'embed';
  html: string;
  provider?: string;
}

export interface RawHtmlBlock {
  type: 'rawHtml';
  html: string;
  reason: string;
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | GalleryBlock
  | ButtonBlock
  | ListBlock
  | ColumnsBlock
  | DividerBlock
  | VideoBlock
  | EmbedBlock
  | RawHtmlBlock;

const imageBlockSchema = z.object({
  type: z.literal('image'),
  src: z.string().min(1),
  alt: z.string(),
  caption: z.string().optional(),
});

export const contentBlockSchema: z.ZodType<ContentBlock> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('heading'),
      level: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ]),
      text: z.string(),
      inlines: z.array(inlineNodeSchema).optional(),
      id: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal('paragraph'),
      text: z.string(),
      inlines: z.array(inlineNodeSchema).optional(),
      id: z.string().min(1).optional(),
    }),
    imageBlockSchema,
    z.object({ type: z.literal('gallery'), images: z.array(imageBlockSchema) }),
    z.object({
      type: z.literal('button'),
      label: z.string(),
      href: z.string().min(1),
    }),
    z.object({
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(z.string()),
      itemInlines: z.array(z.array(inlineNodeSchema)).optional(),
      id: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal('columns'),
      columns: z.array(z.array(contentBlockSchema)),
    }),
    z.object({ type: z.literal('divider') }),
    z.object({
      type: z.literal('video'),
      src: z.string().min(1),
      poster: z.string().optional(),
    }),
    z.object({
      type: z.literal('embed'),
      html: z.string(),
      provider: z.string().optional(),
    }),
    z.object({
      type: z.literal('rawHtml'),
      html: z.string(),
      reason: z.string().min(1),
    }),
  ]),
);

export interface NavigationItem {
  label: string;
  href: string;
  children: NavigationItem[];
}

export const navigationItemSchema: z.ZodType<NavigationItem> = z.lazy(() =>
  z.object({
    label: z.string(),
    href: z.string().min(1),
    children: z.array(navigationItemSchema),
  }),
);

export const assetSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().url(),
  role: z.enum(['content', 'stylesheet', 'dependency']).optional(),
  localPath: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  checksum: z.string().min(1).optional(),
});

export const warningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export const pageSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().url(),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  title: z.string(),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  blocks: z.array(contentBlockSchema),
});

export const siteSchema = z.object({
  schemaVersion: siteSchemaVersionSchema,
  source: z.object({
    adapter: z.string().min(1),
    baseUrl: z.string().url(),
    capturedAt: z.string().datetime(),
  }),
  metadata: z.object({
    title: z.string(),
    description: z.string().optional(),
    language: z.string().optional(),
  }),
  navigation: z.array(navigationItemSchema),
  pages: z.array(pageSchema),
  assets: z.array(assetSchema),
  redirects: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
    }),
  ),
  warnings: z.array(warningSchema),
}).superRefine((site, context) => {
  const visit = (block: ContentBlock, path: (string | number)[]): void => {
    if (block.type === 'columns') {
      block.columns.forEach((column, columnIndex) => column.forEach((child, childIndex) =>
        visit(child, [...path, 'columns', columnIndex, childIndex]),
      ));
    } else if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'list') {
      const hasInlineFields = block.id !== undefined || (block.type === 'list'
        ? block.itemInlines !== undefined : block.inlines !== undefined);
      if (site.schemaVersion === '1.0.0' && hasInlineFields) {
        context.addIssue({ code: z.ZodIssueCode.custom, path,
          message: 'Inline content and source IDs require schemaVersion 1.1.0.' });
      }
      if (block.type === 'list' && block.itemInlines !== undefined && block.itemInlines.length !== block.items.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'itemInlines'],
          message: 'Inline list items must align with plain-text items.' });
      }
    }
  };
  site.pages.forEach((page, pageIndex) => page.blocks.forEach((block, blockIndex) =>
    visit(block, ['pages', pageIndex, 'blocks', blockIndex]),
  ));
});

export type Asset = z.infer<typeof assetSchema>;
export type MigrationWarning = z.infer<typeof warningSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Site = z.infer<typeof siteSchema>;

export function parseSite(input: unknown): Site {
  return siteSchema.parse(input);
}
