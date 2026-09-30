# Security Policy

## Reporting a vulnerability

Please **don't** open a public issue for a security problem. Report it privately through this repository's **Security → Report a vulnerability** page, with steps to reproduce and the impact you see.

Fixes land on `main`. Reporters are credited if they'd like to be.

## Most relevant areas

This is a local-first, single-user app. Reports about these are especially useful:

- login, sessions and CSRF protection (`backend/auth.py`)
- broker logins and stored credentials (`backend/brokers/`)
- anything that fetches URLs or writes files on the server
- anything that could place orders or move money (brokers must stay read-only)
