# Changelog

All notable changes to ASVA are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/) from v1.0.

## [Unreleased]

### Added
- `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- `hub/.env.example` and `scripts/bootstrap-env.mjs` (random secrets generated per install)
- Documentation: API reference, threat model, hardening guide, privacy verification guide, evaluation protocol
- GitHub Actions: CI (server, web, firmware), CodeQL, dependency review, secret scanning
- Dependabot configuration, issue forms, pull request template, CODEOWNERS

### Changed
- README rewritten into one consistent description (embedded Aedes broker, `node:sqlite`, setup scripts); Mosquitto/Docker moved to an optional section
- README no longer publishes a default admin password

### Security
- Server refuses to start with missing or placeholder secrets
- Per-device MQTT credentials with topic ACL; anonymous connections refused
- Role checks enforced on the server for REST and WebSocket
- Login rate limiting, Helmet headers, locked-down CORS, CSV formula-injection protection
- `sdkconfig` and database files added to `.gitignore`

## [0.1.0] - 2026-__-__

### Added
- Initial prototype: ESP32-S3 firmware, Fastify hub with embedded MQTT broker and SQLite, React + Three.js 3D dashboard (Volumes I-VII), virtual ESP32 simulator, ML training scripts
