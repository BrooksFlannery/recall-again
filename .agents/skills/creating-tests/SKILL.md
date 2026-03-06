---
name: creating-tests
description: Rules for creating tests in this codebase. Use when writing or reviewing tests.
---

# Creating Tests

- **Never mock DB operations.** All tests that interact with the database must run against a real database (test Postgres). Use the project’s test DB setup and real inserts/selects; do not substitute the DB layer with mocks or in-memory fakes.
