# Enigma simulator

A Go library and stateless HTTP controller, plus a standalone JavaScript browser simulator. Enigma emulation and Bombe searches run entirely in the browser. The web pages do not call the Go API. No npm installation or frontend build is required.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the JavaScript engine tests and publishes only the HTML, JavaScript, and CSS from `web/` to GitHub Pages. Go source, development servers, logs, and local caches are not part of the deployed website. Pushes to `main` redeploy automatically; the workflow can also be run manually from GitHub Actions.

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. A project site lives at `https://OWNER.github.io/enigma-lab/`; the Bombe page is `bombe.html` under that URL. Relative asset and navigation links support the repository subdirectory, including worker scripts and shared settings URLs. No backend is needed on GitHub Pages.

## Run locally

For the JavaScript-only web simulator, use Node.js:

```sh
node scripts/serve-web.cjs
```

Open **http://127.0.0.1:8080**. Pass another port if needed: `node scripts/serve-web.cjs 9000`. This command only serves static files and provides no simulation API. You can also host the contents of `web/` on any static HTTP server, including under a subdirectory. Open `index.html` for Enigma or `bombe.html` for Bombe. Use an HTTP server rather than opening files directly because Bombe uses a Web Worker.

The JavaScript engines are in `web/enigma-engine.js` and `web/bombe-engine.js`. The latter runs through `web/bombe-worker.js` so searches keep the interface responsive. Stop terminates active computation as well as simulated pacing waits. The assets use relative links and local system fonts, with no external runtime dependencies.

The Go library/API remains available independently (Go 1.22 or later):

```sh
go run ./cmd/enigma
```

Open **http://127.0.0.1:8080**. Change the address with `go run ./cmd/enigma -addr 127.0.0.1:9000`.

Open **http://127.0.0.1:8080/bombe** for the separate Bombe crib-search page. Both pages are linked in the navigation.

Each page preserves its own state in browser session storage when switching pages or refreshing within the same tab. Enigma keeps setup, current windows, transcript, undo baseline, electrical trace, and message draft. Bombe keeps search inputs and completed/partial results; navigating away stops a running search rather than restarting it automatically. Opening a Bombe candidate explicitly replaces the Enigma setup. Closing the tab ends the saved session.

Settings also appear in the URL's `settings` query parameter. Use **Copy share link** on either page, or copy the address bar. Enigma links include rotor types, rings, current and reset windows, reflector, plugboard, and mode; Bombe links include search inputs, crib alignment, rotor assumptions, plugboard knowledge, and timing. Recipients get settings with a fresh transcript/search; transcripts and search results remain local to the tab. A supplied URL takes precedence over different saved settings. Refreshing an unchanged settings URL preserves the tab's transcript and results. Invalid links show an error and retain the saved/default setup. If clipboard access is unavailable, the copy button reveals a selectable link field.

```sh
go test ./...
go vet ./...
go build -o bin/enigma.exe ./cmd/enigma
```

The Go executable also embeds and serves the same standalone HTML, JavaScript, and CSS. Serving them through Go is optional; all browser simulation still runs in JavaScript.

Run the JavaScript engine tests with:

```sh
node --test tests/browser-engines.test.cjs
```

These cover known ciphertexts, double stepping, M4, ring settings, arbitrary rotor counts, validation, and Bombe cable inference and offset cribs. Set `ENIGMA_GO_URL` to a running Go API URL (such as `http://127.0.0.1:8080`) to include cross-language result comparisons.

## Operate the machine

1. Select M3 (three moving rotors), M4 (stationary Beta/Gamma plus three moving rotors), or a custom stack.
2. Set each wheel's type, ring (1–26), and starting window (A–Z). Rotor order is **left to right**, from reflector to keyboard.
3. Connect plugboard cables by selecting pairs of sockets. Select a connected socket to disconnect it. Letters can appear in only one pair; up to 13 cables are possible.
4. Press and hold a keyboard key, or type A–Z. One keypress steps the rotors once, lights the resulting letter while held, and appends it to the transcript. Key autorepeat is ignored. Only one key is processed at a time.
5. To decrypt, reset to the same starting settings and enter the ciphertext. Encryption and decryption use the same operation.

The transcript is a convenience: real Enigma machines displayed lamps and operators wrote down the result. **Backspace** outside text fields removes the last recorded letter and restores the previous rotor positions and electrical trace, including across turnover and double stepping. It also undoes individual letters from a message submitted in bulk. **Clear paper** clears the transcript and undo history without changing the wheels. **Reset** restores starting windows and clears the transcript. Setup changes restore starting windows and start a fresh transcript. The message input uppercases ASCII letters and discards all other characters. Space is a no-op outside editable fields.

Custom mode supports any positive rotor count, including one or more than four, with no fixed library/UI rotor limit. Repeated rotor types are permitted. Stationary Beta/Gamma wheels must form a left prefix; at least one moving wheel is required. The pawl stepping rule is generalized across the moving stack: the rightmost wheel always steps, and a wheel at its turnover notch advances itself and its left neighbour, with all notches evaluated before movement. The leftmost moving wheel cannot advance itself from its own notch. Stacks outside the historical presets are experimental configurations.

## Library

```go
package main

import (
    "fmt"
    "enigma/enigma"
)

func main() {
    settings := enigma.M3() // I, II, III; AAA; rings 01; reflector B
    machine, err := enigma.New(settings)
    if err != nil { panic(err) }
    cipher, err := machine.Encode("HELLOWORLD")
    if err != nil { panic(err) }
    fmt.Println(cipher) // ILBDAAMTAZ

    receiver, err := enigma.New(settings)
    if err != nil { panic(err) }
    plain, err := receiver.Encode(cipher)
    if err != nil { panic(err) }
    fmt.Println(plain) // HELLOWORLD
}
```

`Press(byte)` returns the output letter and a stage-by-stage electrical trace. `Config()` returns an independent copy of the current configuration. `Encode(string)` accepts only uppercase ASCII A–Z and validates the whole message before advancing. A `Machine` is mutable and is not safe for simultaneous use without external synchronization.

## HTTP API

- `GET /api/catalog`: historical rotor definitions, reflector wirings, and M3/M4 presets.
- `POST /api/encode`: encode/decode using supplied settings. Returns output, updated settings, and the last key's trace.

Example request:

```json
{
  "config": {
    "rotors": [
      {"name":"I","position":"A","ring":1},
      {"name":"II","position":"A","ring":1},
      {"name":"III","position":"A","ring":1}
    ],
    "reflector":"B",
    "plugboard":[]
  },
  "text":"AAAAA"
}
```

The output is `BDZGO` and the returned rotor windows are `AAF`. Send the returned `config` in the next request to continue; send the original `config` to start again. State is per request, so separate browsers cannot advance each other's wheels. Invalid JSON, unknown fields, invalid settings, or non-A–Z text return HTTP 400 with an `error` field. Request bodies are limited to 1 MiB; this bounds request size without imposing a fixed rotor count. The API permits experimental combinations; the UI presets constrain historical rotor/reflector combinations.

## Bombe simulation

The `bombe` Go package and `/bombe` page provide an educational menu/constraint simulation. Supply ciphertext, a guessed plaintext fragment (crib), and its zero-based alignment. Each crib/ciphertext pair becomes a menu link. A self-match immediately rules out the alignment because Enigma cannot encipher a letter into itself.

Select three distinct rotors from I–VIII, fixed ring settings, and a reflector (A, B, or C). Search one order or all six permutations of the selected three wheels. The rings remain attached to their left/middle/right slots during permutations. Each order searches all 17,576 message-start windows; preceding message letters are stepped before testing an offset crib, including actual Enigma turnover and double stepping.

The unknown-plugboard solver propagates `S(cipher) = R(S(plain))` through the menu and enforces reciprocal cables, `S(A)=B` implies `S(B)=A`, corresponding to the diagonal-board principle. It rejects contradictory assignments and uses bounded backtracking to infer one compatible wiring per surviving window setting. Alternatively, provide a complete known plugboard (blank means no cables) to search against fixed wiring.

Click **Load example**, then **Run Bombe** to try a ciphertext with hidden windows and cables. The illustrative drum bank, actual crib menu, search counters, and candidate plaintexts update during the run. **Stop** cancels a run and retains partial results. **Check on Enigma** opens the candidate's message-start configuration on the Enigma page; paste the ciphertext there to verify the full message.

Choose **Instant** to run as fast as the search permits, or **Simulated** to pace the search at a configurable 1–100,000 settings per second (default 300). Both modes show simulated time as tested settings divided by the selected pace, alongside actual elapsed time. Simulated mode waits to follow this schedule; slow computation may take longer. The pace is illustrative, not calibrated to a historical Bombe. Self-match rejection happens before testing positions and adds no simulated time. Timing settings and clocks are preserved with the page state, and Stop interrupts pacing waits immediately.

Scope and limits:

- Three moving service rotors only; no M4 or arbitrary custom stacks in the Bombe search.
- The rotor set, rings, reflector, and crib alignment are supplied assumptions, not automatically discovered.
- Ciphertext must contain 6–500 letters and the crib 6–64 letters. The UI normalizes ASCII letters; the API requires uppercase A–Z.
- Unknown-plugboard backtracking is limited to 2,000 nodes per setting. Settings that exhaust this budget are **unresolved**, not proven contradictions.
- The browser stops at 100 candidates and labels the results truncated. Each rotor setting produces at most one wiring; letters unconstrained by that wiring are left unplugged. A stop is not proof of a correct plaintext or a unique key.
- This models the crib and reciprocal stecker constraints using software. It does not recreate historical relay circuitry, drum gearing, or timing. The drum animation is illustrative.

`POST /api/bombe/search` accepts a bounded chunk request:

```json
{
  "ciphertext":"ILBDAAMTAZ",
  "crib":"HELLOWORLD",
  "offset":0,
  "rotors":["I","II","III"],
  "rings":[1,1,1],
  "reflector":"B",
  "permute":false,
  "known_plugboard":true,
  "plugboard":[],
  "max_pairs":10,
  "cursor":0,
  "limit":64
}
```

Responses contain `next`, `total`, `done`, `tested`, `rejected`, `unresolved`, `last_windows`, `last_order`, and `candidates` (configuration and full plaintext). Continue with `cursor = next`; chunks accept 1–256 positions and yield after about two seconds between positions. Cursor order is lexicographic from AAA through ZZZ, then the next rotor order. Known-plugboard mode uses exactly the supplied cables; `max_pairs` constrains inferred cables in unknown mode. Request bodies are limited to 16 KiB. Search state is supplied by the caller, with cancellation through the request context.

Bombe tests cover recovery of unknown steckers, offset cribs across double stepping with nontrivial rings, permuted orders, resume cursors, impossible alignments, invalid assumptions, cancellation, reciprocal bindings, and solver budget reporting.

Historical references: [The National Museum of Computing: Bombe Description](https://www.tnmoc.org/bh-10-bombe-description) and [Enigma and the Turing Bombe](https://cryptocellar.org/shaylor/bombe.html).

## Enigma mechanics and verification

Includes I–VIII, Beta/Gamma, reflectors A/B/C and thin B/C, ring offsets, simultaneous pre-keypress stepping, middle-wheel double stepping, dual naval notches, reciprocal plugboard pairs, and a stationary M4 Greek wheel. The service entry wheel is the identity mapping.

Tests cover known M3 vectors (`AAAAA → BDZGO`, `HELLOWORLD → ILBDAAMTAZ`), double stepping, turnover independent of ring setting, both naval notches, M4 compatibility and stationary-wheel behavior, arbitrary-count reciprocity, invalid input, configuration ownership, API continuation, validation, and embedded assets.

References: [Enigma Museum rotor wiring](https://enigmamuseum.com/rotwirg.htm) and [Crypto Museum working principle](https://www.cryptomuseum.com/crypto/enigma/working.htm).

This is a historical/educational cipher emulator. Enigma is not suitable for protecting modern secrets.
