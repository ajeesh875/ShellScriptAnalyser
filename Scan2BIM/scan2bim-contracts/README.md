# Scan2BIM Contracts

Executable Pydantic v2 schemas derived from the accepted Scan2BIM API, Event, Queue, and Workflow contracts.

## Rules

- JSON serialization uses camelCase.
- Unknown fields are rejected for producer/request and internal contracts.
- Message and workflow identities are validated.
- Durable contracts never carry credentials, signed URLs, or binary content.
- Logical contract version is `1.0`.

## Layout

- `common`: shared types, enums, artifact and error contracts
- `commands`: command envelope and five processing command payloads
- `events`: event envelope and core lifecycle event payloads
- `workflows`: workflow input, state, signal, query, result and policy
- `api`: common API schemas and core Project, Ingestion, Workflow and Delivery resources

Run tests with `pytest` after installing development dependencies.
