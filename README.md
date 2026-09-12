<p align="center">
  <img src="docs/banner.svg" alt="dsh-swipe" width="720">
</p>

<h1 align="center">dsh-swipe</h1>

<p align="center"><strong>Version 0.1.0</strong></p>

<p align="center">
  <em>Tavern-style swipe reroll for DeepSeek Harness — reroll any assistant reply into a forked version chain, then step through versions with prev / next.</em>
</p>

<p align="center">
  <a href="https://github.com/CXY1523/dsh-swipe/stargazers"><img src="https://img.shields.io/github/stars/CXY1523/dsh-swipe?logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/CXY1523/dsh-swipe/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://www.deepseek.com/harness/"><img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-blue" alt="DSH"></a>
  <br>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=fff" alt="Node.js">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000" alt="JavaScript">
  <img src="https://img.shields.io/badge/client--only-web-0ea5e9" alt="client-only">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

> Built against **dsh 0.1.1-rc.2**. It uses the `conversation.chat.assistant-actions` slot and the `sessions.fork` / `session.prompt` client APIs. On a build without them the plugin loads but renders no action.

---

## What this is

**dsh-swipe** is a client-only Web plugin for [DeepSeek Harness](https://www.deepseek.com/harness/). It puts a reroll action on every finalized assistant reply and keeps the results as a version chain you can walk back and forth.

- `⟳` **Reroll** on each assistant reply — forks the session and regenerates that turn.
- `◀ 2/3 ▶` **Version bar** on version replies — jump between the versions of one reply.
- **Chained rerolls** — reroll a reroll to grow the chain (v3, v4, …).
- **No host code** — the plugin never touches the session log; it drives the public Web client APIs.

There is no in-place history rewrite: dsh's session log is append-only. Each version is a real forked session, the old one stays intact, and stepping versions moves between sessions. That is the closest faithful mapping of a Tavern swipe onto this engine, and it buys you something Tavern does not have: every version keeps its own full, explorable branch.

---

## Features

| | |
|---|---|
| Reroll entry point | the message action strip (between copy and branch) |
| Fork anchor | the end of the previous completed turn, so the child starts at this turn's user message |
| Re-prompt | the turn's user message is re-sent into the child automatically |
| Version store | browser `localStorage`, key `dsh-swipe:v1` |
| Version navigation | `sessions.open(versionSessionId)` — a session jump, no reload |
| Child titles | inherited and incremented via `increaseTitle` (e.g. `Title (2)`) |
| Icons | the shell's own icon set (`IconRefreshOutline16`, chevron 14s) |
| i18n | `zh` / `en`, registered under the `dsh-swipe` locale namespace |

---

## How a reroll works

```
session A (current)
  … previous turns …
  user   U      ← the turn you want another take on
  assistant R   ← click ⟳ here
                 │
                 ├─ fork A at "end of previous turn"
                 │     child seed stops at U (host cut semantics)
                 ├─ child B = session-…   (parentSessionId = A)
                 ├─ prompt(U.content) into B
                 └─ open B
session B (v2)
  … previous turns …
  user   U      ← from the seed
  user   U      ← the automatic re-send
  assistant R'  ← the new version, with ◀ 2/2 ▶
```

The chain lives in `localStorage`, keyed by the anchor user-message seq of the root session:

```jsonc
{
  "chains": {
    "session-abc…:42": { "anchorSeq": 42, "versions": ["session-abc…", "session-def…"] }
  },
  "bySession": {
    "session-abc…": { "chainId": "session-abc…:42", "index": 0 },
    "session-def…": { "chainId": "session-abc…:42", "index": 1 }
  }
}
```

Version replies are located by position — root session: first assistant after the anchor; forked session: first assistant after the re-sent user message — so the bar stays on the right message even as the conversation grows.

Clearing `localStorage["dsh-swipe:v1"]` forgets chains; sessions and messages are untouched.

---

## Compared with SillyTavern swipes

| | SillyTavern | dsh-swipe |
|---|---|---|
| Where variants live | one chat, N response candidates | one session per variant (fork tree) |
| Switching | swipe left / right in place | session jump from the version bar |
| Regeneration context | re-send the prompt, previous candidate dropped | fresh fork from the turn's user message |
| Old versions | kept in the swipe list | kept as intact parent sessions |
| Reach | last message (or by swiping back) | any assistant reply in the open window |

---

## Install

dsh loads plugins from a **profile**: a `package.json` with the plugin in `dependencies` and in `dsh.profile.bundles`. Pick one of the following.

**From a local checkout (recommended while developing)**

```jsonc
// <profile>/package.json
{
  "dependencies": {
    "dsh-swipe": "link:C:/path/to/dsh-swipe"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // … other bundles …
        "dsh-swipe"
      ]
    }
  }
}
```

**From git**

```jsonc
"dsh-swipe": "github:CXY1523/dsh-swipe"
```

Then install and restart dsh:

```bash
cd <profile>
pnpm install
# restart dsh (the plugin's client bundle is served from the boot manifest)
```

The profile usually lives at `~/.dsh/profiles/web`. After the restart, hard-refresh the page (`Ctrl+Shift+R`) so the browser picks up the new boot manifest.

**Verify it loaded**

```bash
curl -s http://127.0.0.1:3080/ | grep -o '"id":"dsh-swipe"[^}]*'
# {"id":"dsh-swipe","url":"/plugins/dsh-swipe/client.js?rev=…","rev":"…","inject":[…]}
```

If the entry is missing, the profile `bundles` list or `pnpm install` is the problem — not the plugin code.

---

## Usage

1. Hover an assistant reply and click **⟳** in its action strip.
2. The session forks, the turn's user message is re-sent, and the new reply streams into the new session.
3. On a version reply the strip shows **◀ i/n ▶**; click either arrow to move between versions (the session switches, nothing is lost).
4. Click **⟳** on any version to push the chain further.

Hovering the button shows the same shape as the shell's other actions: tertiary label colour, hover to secondary with a circular hover background.

---

## Layout

```
dsh-swipe/
├── client.js              # the whole plugin: slots entry, reroll, version store, UI
├── package.json           # dsh.client (platform/inject) + dsh.bundle.patch
├── cordis.patch.yml       # inserts the plugin into the profile layer stack
├── lib/
│   └── index.js           # host entry — intentionally a no-op (client-only plugin)
├── docs/
│   └── banner.svg
├── README.md              # English
├── README.zh-CN.md        # 中文
└── LICENSE
```

---

## Integration points

| Piece | Contract |
|---|---|
| Slot | `conversation.chat.assistant-actions` (`kind: list`, session scope) — the strip rendered inside each finalized message's action row |
| Services | `ctx.slots`, `ctx.locale`, `ctx.sessions` |
| Session API | `sessions.fork({ sessionId, atSeq, increaseTitle })`, `sessions.open(id)`, `sessions.binding(id)?.session.prompt(content, "queue")` |
| Snapshot reads | `snapshot.nodes` (finalized messages), `snapshot.turnEnds` (turn → `turn/end` seq) |
| Icons | `@deepseek-ai/dsh-client-ui-primitives`, declared in `dsh.client.inject` |
| Storage | `localStorage["dsh-swipe:v1"]` |

---

## Limitations

- **Client-only feature.** The host half is a no-op; there is no HTTP route, no model tool, no prompt injection.
- **Versions are sessions.** Stepping versions switches sessions. If you want both variants side by side, open the parent session in another tab.
- **Window-bound.** The reroll plan is derived from the message window the client has loaded (50 messages). Replies scrolled out of the window render no button until you page the history back in.
- **Text only.** Image blocks in the anchor user message are dropped when the message is re-sent; a purely non-text message cannot be rerolled.
- **First turn falls back.** With no completed turn before it, the anchor degrades to the turn itself, so the child keeps the old reply and any following user message.
- **Metadata stays local.** Chains live in one browser profile; another browser or a cleared storage simply loses the version bar, not the sessions.

---

## Development

```bash
# syntax check the bundle (it is a plain script-wrapped CJS bundle)
node --check client.js

# after editing, restart dsh and hard-refresh the page
```

The bundle is loaded verbatim — `window.__ModuleLoader__.load({ id, factory })` with a factory that `require`s the platform seeds (`react`) and the packages declared in `dsh.client.inject`. No build step.

The plugin is exercised against the shipped shell: enable it in a profile, restart, and confirm the `⟳` appears in the action strip of a settled assistant reply.

---

## License

MIT
