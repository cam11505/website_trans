# ADR-010: Provide a conservative Generic HTML fallback adapter

- Status: Accepted
- Date: 2026-08-19

## Context

The Phase 9 registry removed Weebly-specific orchestration from the CLI, but only one production adapter was registered. The extension boundary needed a second implementation, and many sites can still be partially rescued from standards-based server-rendered HTML even when their original platform is unknown.

## Decision

Register a `generic-html` adapter after platform-specific adapters. It detects recognizable HTML with confidence `0.1`, ensuring a stronger platform-specific match wins while generic HTML remains available as a fallback.

The adapter extracts conservative, schema-supported content from server-rendered HTML: metadata, navigation, headings, paragraphs, images, lists, button-like links, dividers, video, embeds, and selected assets. Forms, tables, and objects are preserved as inert raw HTML for manual review.

Every generic capture includes a `generic-html-fallback` warning. This makes the migration report require review and prevents the fallback from implying platform-aware or complete recovery.

## Consequences

- Site Rescue can capture standards-based sites whose platform is unknown.
- Phase 9's adapter registry is exercised by two production implementations.
- Weebly remains preferred whenever its detection confidence crosses the adapter threshold.
- Client-rendered content, scripts, styling behavior, forms, and platform-specific features remain outside the fallback's guarantees.
