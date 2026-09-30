# Contributing

Thanks for helping improve the Indian Market Trading Agent! This guide keeps contributions easy to review and merge.

## Before you start

- **Found a bug?** Open an issue with steps to reproduce, what you expected, what happened, and your setup (OS, Python/Node versions, LLM provider, broker).
- **Planning a feature or a bigger change?** Open an issue first so we can agree on the approach before you build it, especially for anything that adds a broker, a data source or a dependency.

## Workflow

1. Fork the repo and add the original as `upstream`:
   ```bash
   git remote add upstream https://github.com/pradeepsiddappa/indian-trading-agent.git
   ```
2. Start **every change on a new branch from the latest `main`**:
   ```bash
   git fetch upstream
   git checkout -b fix/kite-login upstream/main
   ```
   Never work on your fork's `main`: a pull request opened from it picks up everything you push there later.
3. Keep each pull request to **one change**: one bug fix or one feature. Small PRs get reviewed quickly; big mixed ones get sent back.
4. Run the checks below, push your branch, and open a pull request into `main`. Fill in the template.
5. Answer review comments by pushing to the **same branch**. The pull request updates itself.

Pull requests are squash-merged into a single commit that credits you.

## Running the checks

```bash
# Backend (Python 3.11+)
pip install -r requirements.txt
python -m unittest discover -s tests

# Frontend (Node 20.9+)
cd frontend && npm ci && npx tsc --noEmit && npm run build
```

The same checks run automatically on every pull request.

## Guidelines

- **Tests:** add or update tests for your change. Tests must not call real services; mock the network (see `tests/` for examples).
- **No unrelated changes:** no drive-by reformatting, personal tooling or GitHub workflow changes unless they are the point of the PR.
- **Security-sensitive code** gets extra scrutiny: login and OAuth flows, broker credentials, `backend/auth.py`, and anything that fetches URLs or writes files.
- **Brokers are read-only.** Order placement is out of scope unless it has been agreed in an issue first (see #6).
- **Tickers:** pass user-supplied symbols through `normalize_ticker()`.
- **Secrets:** never commit API keys, tokens or `.env` files.

## Security issues

Please don't report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
