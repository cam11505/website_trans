# ADR-005: Crawl conservatively and stay on origin

- Status: Accepted
- Date: 2026-08-14

## Context

A rescue crawl must discover a site without accidentally following the public web, downloading unbounded content, or executing site code.

## Decision

Use deterministic breadth-first discovery. Follow only HTTP(S), same-origin links that resolve to HTML pages. Remove fragments, deduplicate canonical URLs, enforce page and timeout limits, identify the user agent, and do not execute JavaScript. Record recoverable fetch failures as warnings.

## Consequences

- Crawls are bounded, repeatable, and testable.
- Client-rendered routes and links hidden behind interaction may not be discovered in phase one.
- Authentication, robots policy automation, throttling strategy, and resumable crawling require later explicit decisions.

