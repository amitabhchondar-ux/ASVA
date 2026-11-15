## Summary

<!-- What does this pull request change, and why? Link the issue: Fixes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Security improvement
- [ ] Documentation
- [ ] Refactor / chore / CI

## Component(s)

- [ ] hub/server
- [ ] hub/web
- [ ] hub/simulator
- [ ] firmware
- [ ] ml
- [ ] docs / CI

## How I tested it

<!-- Commands you ran, hardware used (board, microphone, ESP-IDF version), screenshots. -->

- [ ] Unit/integration tests added or updated and passing
- [ ] Tried with the simulator
- [ ] Tried on real hardware (board: ______, ESP-IDF: ______)

## Checklist

- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md) and followed the [Code of Conduct](../CODE_OF_CONDUCT.md)
- [ ] The change is focused on one thing
- [ ] Docs updated (`README.md`, `docs/API.md`, `hub/.env.example`) if behaviour or settings changed
- [ ] `CHANGELOG.md` updated under **Unreleased**
- [ ] No lint or type errors

### Security and privacy

- [ ] No secrets, passwords, tokens, `.env`, `sdkconfig`, database files or audio in this pull request
- [ ] New routes have a schema, a role guard, rate limiting where needed, and tests for 401/403
- [ ] SQL is parameterised; external input is validated
- [ ] No audio is sent, logged or stored by this change (or the privacy verification results were updated)
- [ ] New dependencies are justified below, and `npm audit` shows no high-severity issues

<!-- Dependencies added/updated and why: -->

## Screenshots or logs (remove any secrets)

<!-- optional -->
