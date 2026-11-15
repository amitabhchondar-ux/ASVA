# Contributing to ASVA

Thank you for thinking about contributing. ASVA mixes **firmware (C++)**, a **Node/TypeScript hub**, a **React + Three.js website** and a **Python ML pipeline**, so there is room for many kinds of help, from fixing a typo to training a better model.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). **Security problems must not be filed as public issues**; see [`SECURITY.md`](SECURITY.md).

## Table of contents

1. [Ways to help](#1-ways-to-help)
2. [Before you start](#2-before-you-start)
3. [Set up your development environment](#3-set-up-your-development-environment)
4. [Repository map](#4-repository-map)
5. [Workflow: from idea to merged pull request](#5-workflow-from-idea-to-merged-pull-request)
6. [Branches and commit messages](#6-branches-and-commit-messages)
7. [Code style](#7-code-style)
8. [Testing](#8-testing)
9. [Security rules every contribution must follow](#9-security-rules-every-contribution-must-follow)
10. [Working on firmware](#10-working-on-firmware)
11. [Working on the ML pipeline](#11-working-on-the-ml-pipeline)
12. [Writing documentation](#12-writing-documentation)
13. [Reporting bugs and requesting features](#13-reporting-bugs-and-requesting-features)
14. [Review process and what we look for](#14-review-process-and-what-we-look-for)
15. [Releases](#15-releases)
16. [Licensing of contributions](#16-licensing-of-contributions)

---

## 1. Ways to help

| You are good at | Ideas |
|---|---|
| Writing | Fix typos, clarify the README, add troubleshooting entries, translate docs |
| Testing | Run the evaluation protocol with your own voice and report results; test on other OSes and browsers |
| Frontend | Accessibility of the 3D UI (keyboard navigation, reduced motion, screen-reader labels), mobile layout |
| Backend | Tests for routes and the MQTT bridge, retention settings, TLS support |
| Firmware | Power use, OTA update design, additional output actions, unit tests for command parsing |
| ML | Better negative samples, noise augmentation, quantisation experiments, benchmark reports |
| Security | Review the threat model, write tests that prove each requirement, try to break it (and report privately) |

Look for issues labelled **`good first issue`** and **`help wanted`**.

---

## 2. Before you start

1. **Search existing issues and pull requests** so you do not duplicate work.
2. For anything bigger than a small fix, **open an issue first** and describe what you plan to change. Agreeing on the approach first saves everyone time.
3. **Comment on the issue** to say you are working on it so two people do not do the same task.
4. Keep each pull request **focused on one thing**. Small pull requests get reviewed faster.

---

## 3. Set up your development environment

### Requirements

| Tool | Version | Needed for |
|---|---|---|
| Git | recent | everything |
| Node.js | 24 LTS | hub, website, simulator |
| npm | comes with Node | everything JavaScript |
| ESP-IDF | 5.x | firmware only |
| Python | 3.10+ | ML only |
| Mosquitto clients (optional) | any | manual MQTT testing |

### Get the code

```bash
# 1. Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/ASVA.git
cd ASVA
git remote add upstream https://github.com/amitabhchondar-ux/ASVA.git

# 2. Install and build everything (also creates hub/.env with random secrets)
npm run setup
npm run bootstrap     # only if setup did not already create hub/.env

# 3. Run it
npm start             # terminal 1: hub + MQTT broker
npm run simulate      # terminal 2: virtual ESP32
```
Open <http://localhost:8080>. The admin password was printed once by the bootstrap script. **Never commit `hub/.env`.**

### Work on one part

| Part | Commands |
|---|---|
| Server | `cd hub/server && npm run dev` · `npm test` |
| Website | `cd hub/web && npm run dev` · `npm test` |
| Simulator | `cd hub/simulator && npm run simulate -- --broker mqtt://localhost:1883 --id asva-sim-01` |
| Firmware | `cd firmware && idf.py set-target esp32s3 && idf.py menuconfig && idf.py build` |
| ML | `cd ml && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` |

### Keep your fork up to date

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
```

---

## 4. Repository map

| Path | What lives there |
|---|---|
| `hub/server/` | Fastify API, MQTT broker, WebSocket, database |
| `hub/web/` | React + Three.js website |
| `hub/simulator/` | Virtual ESP32 |
| `firmware/` | ESP-IDF project (C++) |
| `ml/` | Training, evaluation, quantisation scripts |
| `docs/` | API reference, threat model, hardening, privacy verification, evaluation |
| `scripts/` | Helper scripts such as `bootstrap-env.mjs` |
| `.github/` | CI workflows, issue and pull request templates |

---

## 5. Workflow: from idea to merged pull request

1. **Create a branch** from an up-to-date `main` (naming below).
2. **Make your change** in small, logical commits.
3. **Run the checks locally**: lint, type-check, tests, and a manual try-out with the simulator.
4. **Update the docs** if behaviour, settings, topics or routes changed (`README.md`, `docs/API.md`, `hub/.env.example`, `CHANGELOG.md`).
5. **Push** to your fork and **open a pull request** against `main`. Fill in the template completely.
6. **Respond to review comments** by pushing more commits (do not force-push while someone is reviewing unless asked).
7. A maintainer **merges** once CI is green and the review checklist is satisfied. We normally "squash and merge".

Draft pull requests are welcome for early feedback; mark them **Draft**.

---

## 6. Branches and commit messages

### Branch names

```
feat/<short-topic>      feat/mqtt-tls
fix/<short-topic>       fix/ws-reconnect
docs/<short-topic>      docs/evaluation-protocol
sec/<short-topic>       sec/login-rate-limit
test/<short-topic>      test/viewer-role-checks
chore/<short-topic>     chore/update-deps
```

### Commit messages ([Conventional Commits](https://www.conventionalcommits.org/))

```
<type>(<scope>): <summary in the imperative, under 72 characters>

<optional body: what and why, not how>

<optional footer: Fixes #123>
```

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `sec` | Security improvement |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `build` / `ci` / `chore` | Tooling, workflows, housekeeping |

Scopes: `server`, `web`, `simulator`, `firmware`, `ml`, `docs`, `ci`.

Examples:
```
feat(server): require per-device MQTT credentials
fix(web): reconnect WebSocket after the laptop wakes from sleep
sec(server): neutralise formula characters in CSV export
docs: add privacy verification guide
```

**Never put secrets, personal data or audio in a commit.**

---

## 7. Code style

General: readable beats clever; small functions; meaningful names; comments explain **why**, not what.

| Language | Rules |
|---|---|
| **TypeScript** (server, web, simulator) | `strict` mode on; no `any` without a comment explaining why; `async/await` over callbacks; handle errors explicitly; validate all external input; run `npm run lint` and `npm run format` (ESLint + Prettier) |
| **React** | Function components and hooks; no `dangerouslySetInnerHTML`; keep Three.js code in dedicated modules and dispose of geometries/materials/textures on unmount to avoid memory leaks; support `prefers-reduced-motion` |
| **C++ (firmware)** | ESP-IDF conventions; check every `esp_err_t`; `snprintf` not `sprintf`; no dynamic allocation in the audio path; keep tasks and buffer sizes documented |
| **Python (ml)** | PEP 8, type hints where useful, `black` formatting; fixed random seeds for reproducibility; no hard-coded paths |
| **Markdown** | One sentence per idea, tables for reference data, fenced code with a language tag, relative links |

> **TODO (maintainer):** if the repository has no ESLint/Prettier configuration yet, add one and the `lint`/`format` scripts so this section is true.

---

## 8. Testing

Every code change should come with a test, or a clear explanation of why not.

```bash
cd hub/server && npm test             # unit and integration tests
cd hub/web    && npm test             # component tests
cd hub/web    && npx playwright test  # end-to-end tests (needs the simulator running)
```

What to test:

- **Server:** each route (success, validation failure, wrong role, unauthenticated), the MQTT ACL, event parsing, CSV escaping.
- **Web:** components render, role-based buttons hidden, error states.
- **Firmware:** command parsing, threshold clamping and anything that does not need hardware, as host-side unit tests where possible.
- **ML:** the evaluation script reproduces the reported numbers from a fixed seed.

Bug fixes need a test that fails before the fix and passes after.

Manual pre-merge checklist for UI or protocol changes: run the simulator, send each command, flag an event, export CSV, log in as viewer and as admin.

---

## 9. Security rules every contribution must follow

These come from [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Pull requests that break them will not be merged.

- [ ] **No secrets** in code, tests, docs, screenshots or commit history. Use `hub/.env` (git-ignored) and update `hub/.env.example` with a placeholder.
- [ ] **No default passwords.** Credentials are generated per install.
- [ ] **Every new route** has a JSON schema, a role guard (`requireRole`) and rate limiting where appropriate, **and** a test for 401/403.
- [ ] **Every SQL statement is parameterised.** No string concatenation with user input.
- [ ] **Every MQTT payload is validated** before it is stored; devices stay inside their own topic prefix.
- [ ] **No audio leaves or is stored on the device.** Do not add code that publishes, logs or writes audio buffers. If you must change the audio path, update [`docs/PRIVACY_VERIFICATION.md`](docs/PRIVACY_VERIFICATION.md) results.
- [ ] **Do not log** passwords, cookies, tokens or raw payloads.
- [ ] **Escape output:** no `innerHTML`, no unescaped values in CSV.
- [ ] **New dependencies** are justified in the pull request: maintained, widely used, license compatible (MIT/Apache/BSD), no known high-severity advisories (`npm audit`).
- [ ] **Never open ports to the internet** in docs or examples.

---

## 10. Working on firmware

- Credentials come from `menuconfig`. **`firmware/sdkconfig` and `sdkconfig.old` are git-ignored: never commit them.** `sdkconfig.defaults` must contain placeholders only.
- Keep the audio buffer in static RAM; do not add file systems or network calls that touch audio.
- Output pin (GPIO 10) must default **low** at boot and not change when Wi-Fi or MQTT drops.
- Test on real hardware if you can; say in the pull request which board, microphone and ESP-IDF version you used.
- Include `idf.py size` output in the pull request if you changed memory use.
- **Do not** enable flash encryption or secure boot in committed defaults: they are irreversible on a given board and make development harder.
- Mains-voltage hardware: describe only isolated relay modules in docs, with a safety warning.

---

## 11. Working on the ML pipeline

- Record the dataset source, licence and size for every dataset you use. **Do not commit recordings of real people without their written consent**, and do not commit large data files (use links or scripts to download).
- Fix random seeds and log: dataset version, model architecture, quantisation settings, and the final metrics.
- Report results on a **held-out set with speakers not seen in training**, and include a false-accept measurement on background audio.
- Contributions that change the model must include the size on device (flash/RAM) and the effect on latency.

---

## 12. Writing documentation

- Match the facts in the code. If you change a route, topic, setting or command, update `docs/API.md` and `README.md` in the same pull request.
- Prefer short examples that can be copy-pasted and run.
- Do not write claims that are not backed by a measurement or a test (for example "100% accurate"). Link to the evidence.
- Screenshots: no real emails, tokens or IP addresses of your home network; crop or blur.

---

## 13. Reporting bugs and requesting features

Use the [issue forms](https://github.com/amitabhchondar-ux/ASVA/issues/new/choose). A good bug report contains:

1. What you expected and what happened
2. Exact steps to reproduce
3. Component and version/commit
4. OS, Node version, browser, ESP-IDF version, hardware
5. Logs (last ~30 lines), **with passwords and tokens removed**

For features, describe the **problem** you want to solve before the solution, and who benefits.

---

## 14. Review process and what we look for

Reviewers check:

- It does what the pull request says, and nothing surprising
- Tests added or updated and passing; CI green
- Security rules (section 9) respected
- Docs and `CHANGELOG.md` updated (under **Unreleased**)
- Code is readable and consistent with the surrounding style
- No unrelated formatting changes or large generated files

Expect a first response within about a week (this is a volunteer project). Feedback is about the code, never about you. If you disagree, explain your reasoning; we are happy to be convinced.

---

## 15. Releases

Maintainers only.

1. Move **Unreleased** entries in `CHANGELOG.md` under a new version heading with the date.
2. Bump versions in `package.json` files and the firmware version string.
3. Run the full test suite and the [pre-demo checklist](docs/SECURITY_HARDENING.md#16-pre-demo-checklist).
4. Tag: `git tag -a v0.2.0 -m "ASVA v0.2.0" && git push origin v0.2.0`.
5. Create a GitHub Release from the tag, copying the changelog notes and attaching the firmware `.bin` and its checksum.

---

## 16. Licensing of contributions

ASVA is released under the [MIT License](LICENSE). By submitting a contribution you confirm that you wrote it (or have the right to submit it) and that you agree it is released under the same licence. Do not submit code or data copied from sources with incompatible licences.

Thank you for helping make ASVA better.
