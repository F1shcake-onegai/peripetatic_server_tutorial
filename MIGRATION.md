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

## Differences after the migration

- Footnotes are numbered in reading order. In chapter 3 the last three were 5, 4, 3 and are now 3, 4, 5.
- "Reference" is listed under "On this page".
- A heading that ends in a footnote shows its number under "On this page", e.g. "Kernel parameters4".
- Code blocks have a terminal-style frame.
- There is no back-to-top button.
- Search only works in the built site (`npm run build`, then `npm run preview`), not in `npm run dev`.

## Commands

| MkDocs | Starlight |
|---|---|
| `pip install -r requirements.txt` | `npm ci` |
| `mkdocs serve` | `npm run dev`, then <http://localhost:4321/peripetatic_server_tutorial/> |
| `mkdocs build` (to `site/`) | `npm run build` (to `dist/`) |
| `mkdocs gh-deploy --force` | The workflow, on a push to a branch in its `branches:` list |

## Migrating back

1. Restore `mkdocs.yml`, `hooks/`, `requirements.txt` and `docs/stylesheets/steps.css` from branch `mkdocs-20261106`.
2. For each `.mdx` page, apply the syntax table from right to left, remove the `import` line, and save it as `.md` under `docs/`.
3. Add any new pages to `nav` in `mkdocs.yml`, in the same order as `sidebar` in `astro.config.mjs`.
4. Restore the MkDocs steps in `.github/workflows/docs.yml`.
