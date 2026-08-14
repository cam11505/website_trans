# ADR-003: Start CLI-first and local-first

- Status: Accepted
- Date: 2026-08-14

## Context

Website owners need a tool they can download, inspect, and run without creating an account or sending site content to a hosted service.

## Decision

The first application is a CLI. Crawling and future migration artifacts run and stay on the user's machine by default. A stable programmatic package layer sits below the CLI so a future UI can reuse it without becoming the core.

## Consequences

- Automation and reproducible issue reports are straightforward.
- No hosted backend, authentication, billing, or cloud infrastructure is required.
- Users are responsible for having permission to crawl and migrate a source website.

