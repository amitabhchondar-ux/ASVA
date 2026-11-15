# ASVA Evaluation Protocol

How to measure whether ASVA actually works, in a way that another person can repeat and trust. Use the **Evaluation Lab** (Volume III) to record sessions; this document tells you *what* to test and *how to report it*.

---

## 1. What we measure

| Metric | Definition | Formula |
|---|---|---|
| **Detection rate** (recall) | Share of spoken commands the device recognised correctly | `correct_detections ÷ commands_spoken` |
| **Wrong-command rate** | Recognised, but as a different command | `wrong_label ÷ commands_spoken` |
| **Miss rate** | Spoken but not detected at all | `missed ÷ commands_spoken` |
| **False activations per hour** | Detections with no matching utterance | `false_detections ÷ listening_hours` |
| **P95 latency** | The delay under which 95% of commands finish | 95th percentile of `(action time − end of speech)` |
| **Median latency** | Typical delay | 50th percentile |
| **Memory headroom** | Lowest free heap seen during the session | `min(heap_free)` |
| **Wake-word FAR/FRR** (optional) | False accept / false reject rate of the wake word alone | `FAR = false_wakes ÷ hours`, `FRR = missed_wakes ÷ wake_attempts` |

**How to compute the 95th percentile (nearest-rank method):** sort all latencies ascending; with `n` values, P95 is the value at position `ceil(0.95 × n)`. Report `n` next to it; P95 from 10 samples is not meaningful.

---

## 2. Test setup (write all of this down)

Record these for every run so results can be reproduced:

- Date, tester, firmware commit hash, hub commit hash
- Board and microphone model; microphone position and orientation
- Threshold slider value
- Room: size, floor/wall type, furniture
- Noise source, its level in dBA (a phone app is acceptable if you name it; say so), and how far from the device
- Speaker positions and distance from the device
- Whether the device was on USB power or battery

**Calibration:** before starting, say each command 5 times at 1 m in a quiet room. If detection is below 80%, fix hardware/threshold problems first (see Troubleshooting) rather than collecting poor data.

---

## 3. Test matrix

### 3.1 Required conditions

| ID | Condition | Distance | Noise | Notes |
|---|---|---|---|---|
| Q-0.5 | Quiet room | 0.5 m | ~35-40 dBA | Baseline |
| Q-1 | Quiet room | 1 m | ~35-40 dBA | Typical use |
| Q-3 | Quiet room | 3 m | ~35-40 dBA | Far field |
| N-1 | Noisy room | 1 m | ~65 dBA (TV/radio speech or café recording) | Real-world |
| A-1 | Angle test | 1 m, 45° and 90° off-axis | quiet | Microphone directionality |

### 3.2 Recommended extras

- Different speakers: at least **5** people, mixed voices and accents, including at least one who is **not** in the training data
- Speaking styles: normal, quiet, fast
- Similar-sounding phrases (negative tests): e.g. "Hello Asha", "Hello ASDA", "Light on the table", "Flight on", "Right off", "Hello everyone"
- Network loss: unplug Wi-Fi and confirm local LED control still works

### 3.3 Utterances per condition

For each speaker and condition:

- 20 × each command (**"Light on"**, **"Light off"**, **"Status"**), each preceded by "Hello ASVA"
- 20 × "Hello ASVA" alone (wake word without a command)
- Randomise the order; do not say them in blocks, so a lucky run is less likely

For 5 speakers × 3 commands × 20 = **300 utterances per condition**. That is enough to report a detection rate with a reasonable margin (see section 6).

---

## 4. False-activation soak test

False alarms per hour needs **time**, not speech from you.

1. Place the device in a normal room for **at least 1 hour per scenario** (aim for 3-4 hours total).
2. Scenarios: (a) silence, (b) people talking normally, (c) TV or podcast playing, (d) music.
3. Do **not** say the wake word. Count every detection the device logs.
4. Mark each one as "Wrong" in the Event Ledger.
5. `false_activations_per_hour = false_detections ÷ hours`.

Report the scenario next to each number; "0.5 per hour with a TV on" and "0 per hour in silence" tell different stories.

Tip: for repeatable noise, play a fixed recording and note its name and the volume.

---

## 5. Procedure in the dashboard

1. Open **Volume III: Evaluation Lab** and click **Start session**. Enter the condition ID (for example `Q-1`), speaker ID and notes.
2. Say the planned utterances. Keep a printed list or checklist so you know how many you spoke; the software only knows what the device heard.
3. After each batch, look at the Event Ledger. Mark any detection that was wrong with **Mark Wrong**.
4. Enter the number of commands actually spoken in the session summary (needed for the denominator).
5. **Stop session** and **export CSV**. Save as `docs/results/<date>-<condition>.csv`.
6. Repeat for each condition and speaker.

**Do not delete failures.** Reporting only the good runs invalidates the study.

---

## 6. Reporting results

### 6.1 Summary table (copy into the README)

| Condition | Speakers | Utterances | Detection rate | 95% CI | Wrong-cmd rate | Miss rate | False act./hr | Median latency | P95 latency |
|---|---|---|---|---|---|---|---|---|---|
| Q-0.5 | | | | | | | | | |
| Q-1 | | | | | | | | | |
| Q-3 | | | | | | | | | |
| N-1 | | | | | | | | | |

### 6.2 Confidence interval

With `n` utterances and `k` correct, the Wilson 95% interval is:

```
p = k / n
center = (p + 1.96² / (2n)) / (1 + 1.96² / n)
half   = 1.96 * sqrt( p(1−p)/n + 1.96² / (4n²) ) / (1 + 1.96² / n)
CI     = [center − half , center + half]
```
Example: 285 correct out of 300 → 95.0%, 95% CI ≈ 91.9%-96.9%.

Quick Python helper:

```python
from math import sqrt
def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z*z/n
    c = (p + z*z/(2*n)) / d
    h = z * sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return c - h, c + h
print(wilson(285, 300))
```

### 6.3 Confusion matrix

Add a table of what was recognised versus what was spoken:

| Spoken ↓ / Heard → | Light on | Light off | Status | Nothing |
|---|---|---|---|---|
| Light on | | | | |
| Light off | | | | |
| Status | | | | |

### 6.4 Charts

Include: detection rate by condition (bar chart), latency histogram with the P95 line, false activations per scenario. Save as `docs/images/eval-*.png`.

### 6.5 Honest claims

Only write a claim your table supports. Examples:

- OK: "95% detection (95% CI 91.9-96.9%, n = 300) at 1 m in a quiet room."
- Not OK: "Highly accurate" or "sub-second" with no number. If P95 latency is 640 ms, say "P95 latency 640 ms (n = 300)".
- Say what you did **not** test (other languages, children, far-field above 3 m, outdoors).

---

## 7. Latency measurement details

Define clearly what you measure, since "latency" can mean several things:

| Name | From | To |
|---|---|---|
| **Recognition latency** | End of the spoken command | Firmware decides the command |
| **Action latency** | End of the spoken command | GPIO changes |
| **Dashboard latency** | GPIO changes | Event visible in the browser |

The dashboard's `latency_ms` field should state which one it carries. For an independent check, record a phone video (60 fps or higher) showing you speaking and the LED, then count frames: `frames ÷ fps` gives action latency within about 17-33 ms.

---

## 8. Threats to validity (mention these in your report)

- Your own voice is probably in the training data, which makes results look better.
- Small speaker count limits generalisation.
- A single room and a single microphone placement.
- Noise levels measured with a phone are approximate.
- Detection counted from the log can include lucky matches; the Wrong flag relies on you.
- Thermal and power conditions (USB hub vs wall adapter) can change microphone noise.

---

## 9. Checklist before you publish numbers

- [ ] Every condition run with at least 3-5 speakers
- [ ] Denominator (spoken commands) recorded, not guessed
- [ ] False-activation soak done in at least 3 scenarios
- [ ] Raw CSVs saved under `docs/results/`
- [ ] Table and charts added to the README
- [ ] Claims in the README match the table exactly
- [ ] Limitations listed
