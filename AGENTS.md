# AGENTS.md — AI-assisted development rules

This file governs how AI and humans collaborate on this repo.

## Read before changing code

1. Inspect current implementation and architecture
2. Identify the correct layer (domain / application / infrastructure / interfaces)
3. Reuse existing patterns — do not invent new ones without justification
4. Make the smallest coherent change
5. Update tests and documentation when behavior changes

## Hard rules

- Never invent library APIs — verify against installed versions
- Never use `any` to silence TypeScript
- Never disable strictness to make code compile
- Never bypass tests or remove failing tests
- Never weaken auth/authz to make tests pass
- Never use unsafe SQL or trust client-supplied roles
- Never commit secrets or log passwords/tokens
- Never create distributed-system abstractions without a concrete requirement
- No microservices, no Kafka, no Redis, no Elasticsearch, no CQRS, no event
  sourcing, no GraphQL, no gRPC unless explicitly justified
- Do not create generic repository frameworks or custom DI containers

## Commit style

Conventional commits, small and incremental:
`chore:`, `feat:`, `fix:`, `test:`, `docs:`

## Response format for non-trivial features

Before implementing: Goal, affected layers, files likely to change, important
design decision, potential risks.

After implementing: Implemented, files changed, tests added/updated, validation
performed, security considerations, remaining risks.
