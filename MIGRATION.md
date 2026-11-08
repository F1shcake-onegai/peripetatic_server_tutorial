# MkDocs ↔ Starlight migration

| Branch | Generator |
|---|---|
| `master`, `mkdocs-20261106` | MkDocs with Material for MkDocs 9.8.0 |
| `starlight-astro-main` | Astro 7.3.8 with Starlight 0.42.10 |

Astro is pinned to 7.3.8 because Astro 7.4 needs Node.js 22.23.4 or newer, and this PC has 22.22.1.

## Files

| MkDocs | Starlight |
|---|---|
| `mkdocs.yml` | `astro.config.mjs` |
| `docs/index.md` | `src/content/docs/index.mdx` |
| `docs/guide/NN-name.md` | `src/content/docs/guide/NN-name.mdx` |
| `docs/stylesheets/steps.css` | `src/styles/steps.css` (same rules, `.md-typeset` → `.sl-markdown-content`) |
| Material's key styles | `src/styles/keys.css` |
| `attr_list` for `{ .step }` | `plugins/remark-step-headings.mjs` |
| `hooks/references.py` | `remarkRehype.footnoteLabel` in `astro.config.mjs` |
| `requirements.txt` | `package.json`, `package-lock.json` |
| — | `src/content.config.ts` (content collection), `tsconfig.json` |
| `.github/workflows/docs.yml`: `pip install`, `mkdocs gh-deploy --force` | `npm ci`, `npm run build`, force-push `dist/` to `gh-pages` |

## Configuration

| `mkdocs.yml` | `astro.config.mjs` |
|---|---|
| `site_name` | `starlight({ title })` |
| `nav` | `starlight({ sidebar })`; pages are listed by slug, e.g. `guide/04-ai-hat` |
| `extra_css` | `starlight({ customCss })` |
| `hooks` | `markdown.processor: unified({ ... })` |
| `site_url` (not set) | `site` and `base: '/peripetatic_server_tutorial'` |
| `navigation.footer` | Previous/next links, built in |
| `search.highlight`, `search.suggest` | Pagefind, built in |
| `content.code.copy` | Copy button, built in |
| `content.tabs.link` | `syncKey` on each `<Tabs>` (see below) |
| `palette` (light/dark toggle) | Theme menu, built in |
| `navigation.top` | Not available |

## Syntax

Read left to right to migrate to Starlight, right to left to migrate back.

| MkDocs Markdown | Starlight MDX |
|---|---|
| `# Title` on the first line | Frontmatter `title: "Title"`, no `#` heading in the page |
| `## Heading { .step }` | `## Heading {/* .step */}` |
| `## Heading { .step-0 }` | `## Heading {/* .step-0 */}` |
| `## Heading { #my-id }` | `## Heading` (the automatic ID is the same: `esp32-devkit`, `ai-hat-2`) |
| `!!! note` | `:::note` … `:::` |
| `!!! tip "Title"` | `:::tip[Title]` … `:::` |
| `!!! warning` | `:::caution[Warning]` … `:::` |
| `!!! warning "Title"` | `:::caution[Title]` … `:::` |
| `??? info "Title"` (or `??? question`, any type) | `<details>` / `<summary>Title</summary>` … `</details>` |
| `=== "Label"` (one per tab) | `<Tabs syncKey="key">` / `<TabItem label="Label">` … `</TabItem>` … `</Tabs>` |
| `++ctrl+o++` | `<kbd class="key-control">Ctrl</kbd>+<kbd class="key-o">O</kbd>` |
| `++enter++`, `++space++`, `++tab++`, `++y++` | `<kbd class="key-enter">Enter</kbd>`, `<kbd class="key-space">Space</kbd>`, `<kbd class="key-tab">Tab</kbd>`, `<kbd class="key-y">Y</kbd>` |
| `++arrow-up++`, `++arrow-down++` | `<kbd class="key-arrow-up">Up</kbd>`, `<kbd class="key-arrow-down">Down</kbd>` |
| `<https://example.com>` | `[https://example.com](https://example.com)` |
| `[Text](00-hardware.md#ai-hat-2)` | `[Text](../00-hardware/#ai-hat-2)` from a guide page, `[Text](guide/00-hardware/)` from the home page |
| `[Text](04-ai-hat.md){ .md-button }` | `<LinkButton href="../04-ai-hat/" variant="secondary">Text</LinkButton>` |
| `<br>` | `<br />` |
| Footnotes `[^1]` | Unchanged |
| Code blocks | Unchanged |
| Body of an admonition, tab or collapsible indented by 4 spaces | Body not indented; a blank line after the opening tag and before the closing tag |

A page that uses `<Tabs>` or `<LinkButton>` needs this line under the frontmatter (list only what the page uses):

```js
import { LinkButton, TabItem, Tabs } from '@astrojs/starlight/components';
```

MDX rules that plain Markdown doesn't have:

- `{` and `<` outside code are read as JavaScript and HTML. Put them in a code span, or write `\{` and `\<`.
- HTML tags must be closed: `<br />`, not `<br>`.
- Comments are `{/* ... */}`, not `<!-- ... -->`.

## Tab sync keys

MkDocs linked every tab with the same label on the whole site. Starlight only links tabs with the same `syncKey`, and remembers the choice in the browser. Give a new set of tabs the key of the choice it belongs to.

| `syncKey` | Labels | Chapters |
|---|---|---|
| `flash-tool` | Using Raspberry Pi Imager / Using Rufus (Windows) / Using dd (Linux / macOS) | 1 |
| `second-interface` | Using a Plug-and-Play Wi-Fi Dongle / Using an ESP32 DevKit via GPIO | 4 (Student Kit) |
| `esp-transport` | SPI / SDIO | 0, 4 (Student Kit) |
| `hailort` | Using v5.1.1 (Raspberry Pi Official) / Using v5.3.0 (for newer models and htop monitoring) | 4 (School Server) |
| `kernel-fix` | Patching Driver Source / Downgrading Kernel (not recommended) | 4 (School Server) |
| `website-upload` | Using git (Recommended) / Using scp | 7-a |

## Your setup

Starlight only, with no MkDocs equivalent. Readers choose their Raspberry Pi, track and hardware on the setup pages (`/setup/`, `/setup/peripherals/`, `/setup/pins/`). The choice is saved in their browser, and the tutorial then shows only what applies to them, with their pin numbers. Without a saved setup, or with JavaScript off, every page shows everything.

### Page syntax

| What | Syntax |
|---|---|
| Show a block only for some setups | `<Only hw="esp32-c5-devkitc-1">` … `</Only>`. Conditions: `hw`, `notHw`, `mode` (`"esp32-c5-devkitc-1:sdio"`), `notMode`, `track` (`"student"` or `"server"`); several conditions must all match. Without a setup, the block is shown. |
| Show a block only with / without a saved setup | `<Only setup>` … `</Only>` / `<Only setup={false}>` … `</Only>` |
| The same inside a sentence | Add `inline`: `<Only inline setup={false}>, and … if you use SDIO</Only>` |
| Hide a whole page for other setups | Frontmatter `audience:` with `track: server` or `hw: <device id>`. The page leaves the sidebar and Previous/Next; opened anyway, it says it isn't part of the reader's setup. |
| A pin number in text or a table | `<Pin signal="esp32-c5-devkitc-1.handshake" show="pin" />` (physical pin) or `show="gpio"` (GPIO number) |
| A pin number in a code block | `⟦esp32-c5-devkitc-1.handshake:gpio⟧` or `⟦…:pin⟧`. The copy button copies the reader's number. |
| Chapter 0 text the wiring steps reuse | `<WiringSource id="…">` … `</WiringSource>`, see below |

A guide page that uses them needs these lines under the frontmatter (list only what the page uses; from the home page, the path starts with `../../`):

```js
import Only from '../../../components/Only.astro';
import Pin from '../../../components/Pin.astro';
import WiringSource from '../../../components/WiringSource.astro';
```

Without a setup, `<Pin>` and the code placeholders show the pins the device gets on a Raspberry Pi 5 when it's the only hardware.

### Tabs the setup chooses

For the tab groups in `TAB_LABELS` (`src/data/setup/store.js`), the setup opens the matching tab and hides the tab bar, so readers only see their own choice. Other tab groups stay as they are.

| `syncKey` | Chosen by |
|---|---|
| `second-interface` | ESP32 DevKit or Wi-Fi dongle |
| `esp-transport` | The ESP32's interface: SPI or SDIO |

A new tab group that depends on the setup needs its labels in `TAB_LABELS`, exactly as written in the `<TabItem label="…">`.

### Chapter 0: the wiring steps

With a saved setup, chapter 0 shows the wiring steps instead of its own content: before you start, parts without jumper wires (boards on the header, ribbon cables, USB devices), the breadboard, then each module one wire at a time (power, ground, data). Readers tick each step; the ticks stay in their browser. The steps reuse chapter 0's text where it's marked:

| Marker | Used for |
|---|---|
| `<WiringSource id="power-off" inline>` | The first step |
| `<WiringSource id="<device id>">` on a part | Replaces its plain step |
| `<WiringSource id="<device id>" steps>` on a part | Each item of its list is a step |
| `<WiringSource id="<device id>">` on a wired module | A step before its wires |
| `<WiringSource id="<device id>:<mode>">` | Added to that step in this mode, e.g. `esp32-c5-devkitc-1:spi` |

Several blocks with the same id are joined in page order. A heading among them becomes the step's title, with its footnote. Marking a block doesn't change how chapter 0 looks without a setup.

### Adding a GPIO module

1. Add an entry to `DEVICES` in `src/data/setup/devices.js`, next to similar hardware. Take every value from the maker's documentation and list it in `sources`. For example:

    ```js
    {
      id: 'waveshare-hall',
      name: 'Hall Sensor',             // shown on the Peripherals page
      short: 'Hall Sensor',            // shown next to pins on the map
      tracks: ['student'],
      category: 'sensor',              // network, hat, camera, display or sensor (the Peripherals section)
      signals: [vcc33, ground(), dout('DOUT'), aout()],
      sources: ['https://www.waveshare.com/wiki/Hall_Sensor'],
      notes: ['Power: 2.3 V to 5.3 V.'],
    },
    ```

2. Each signal is one wire. `type` is `gpio`, `power` (with `power: '3v3'` or `'5v'`), `ground`, or `analog` (never wired: the Raspberry Pi has no analog inputs). A GPIO signal is fixed (`fixed: 10`), has a default the reader can move (`default: 22`), or gets a free pin. The helpers `vcc33`, `ground()`, `dout()`, `aout()` and `fixed()` cover the common cases.
3. Optional fields: `versions` (board versions shown next to the name), `boards` (if it only works on some boards), `oneOf` (only one of these can be chosen), `header: { covers: true, passthrough: false }` (sits on the header; `passthrough: true` if its extension pins keep the header usable), `uses` (PCIe, camera, display or USB connectors), `protocol` and `modes` (interfaces such as SPI and SDIO), `pinout` (the module's own header pins, shown in the wiring steps).
4. Run `npm test`. The tests check every setup that can be chosen with up to 3 peripherals.

The planner gives pins and greys out what doesn't fit by itself: GPIOs, power, the breadboard rule (more than 2 modules on 3V3 or on 5V need the breadboard's rails), and the wiring steps.

### Where the code is

| Folder or file | What it does |
|---|---|
| `src/data/setup/` | The planner: header map, hardware, pin assignment, breadboard rule, wiring steps, saving the setup. No page code. |
| `src/components/setup/` | The three setup pages and chapter 0's wiring steps |
| `src/components/Only.astro`, `Pin.astro`, `WiringSource.astro` | The page syntax above |
| `src/components/overrides/Head.astro` | Marks each page with the saved setup before it appears, so hidden parts never flash |
| `src/scripts/setup-runtime.js` | On every page: pin numbers, "On this page", Previous/Next and references follow the setup |
| `tests/` | `npm test` |

## Differences after the migration

- Footnotes are numbered in reading order. In chapter 3 the last three were 5, 4, 3 and are now 3, 4, 5.
- "Reference" is listed under "On this page".
- A heading that ends in a footnote shows its number under "On this page", e.g. "Kernel parameters4".
- With a saved setup, a footnote whose markers are all in hidden parts is hidden, and the rest are numbered 1, 2, 3… The number under "On this page" keeps the original number.
- Code blocks have a terminal-style frame.
- There is no back-to-top button.
- Search only works in the built site (`npm run build`, then `npm run preview`), not in `npm run dev`.

## Commands

| MkDocs | Starlight |
|---|---|
| `pip install -r requirements.txt` | `npm ci` |
| `mkdocs serve` | `npm run dev`, then <http://localhost:4321/peripetatic_server_tutorial/> |
| `mkdocs build` (to `site/`) | `npm run build` (to `dist/`) |
| `mkdocs gh-deploy --force` | The workflow, on a push to a branch in its `branches:` list. It runs `npm test` first, and a failing test stops it. |
| — | `npm test` (the setup planner) |

## Migrating back

1. Restore `mkdocs.yml`, `hooks/`, `requirements.txt` and `docs/stylesheets/steps.css` from branch `mkdocs-20261106`.
2. For each `.mdx` page, apply the syntax table from right to left, remove the `import` line, and save it as `.md` under `docs/`.
3. Add any new pages to `nav` in `mkdocs.yml`, in the same order as `sidebar` in `astro.config.mjs`.
4. Restore the MkDocs steps in `.github/workflows/docs.yml`.
5. "Your setup" has no MkDocs equivalent: keep what the site shows without a setup. Delete `<Only setup>` blocks with their content; for every other `<Only>` and for `<WiringSource>`, delete the tags and keep the content; delete `audience`; write the numbers the site shows without a setup in place of `<Pin>` and `⟦…⟧`; and leave the setup pages out of `nav`.
