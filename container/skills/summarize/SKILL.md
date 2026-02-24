---
name: summarize
description: Summarize URLs, articles, YouTube videos, podcasts, and local files. Saves the result as a markdown note in the user's Obsidian Incoming folder. Use whenever the user asks to summarize or "what's this about?" for any URL or file.
allowed-tools: Bash(summarize *), Bash(notesmd-cli *)
---

# Summarize + Save to Obsidian

Fetch and summarize a URL, YouTube video, podcast, or local file, then save the result to the user's Obsidian `Incoming/` folder via `notesmd-cli`.

## When to use (trigger phrases)

- "summarize this URL/article/link"
- "what's this about?" (with a URL)
- "transcribe this YouTube/video"
- "save this to my notes"
- "summarize and save"

## Workflow

### 1. Summarize the content

```bash
summarize "https://example.com" --model google/gemini-2.5-flash-preview
summarize "/path/to/file.pdf" --model google/gemini-2.5-flash-preview
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto
```

### 2. Derive a clean title

Read the summary output and pick a concise, descriptive title (3–8 words, title case). Do not use the URL slug — use the actual subject matter.

Examples: "How to Write Better Prompts", "The State of AI Agents in 2026", "Why Deep Work Matters"

### 3. Save to Obsidian Incoming

```bash
DATE=$(date +%Y-%m-%d)
TITLE="Your Derived Title"
notesmd-cli create "Incoming/${TITLE} ${DATE}" -c "$(cat <<'EOF'
---
source: <original URL or filename>
date: <YYYY-MM-DD>
tags: [incoming, summarize]
---

<full summary content here>
EOF
)"
```

Tell the user the note was saved to `Incoming/<title> <date>`.

## Flags

- `--length short|medium|long|xl` — default is medium; use `long` if user asks for detail
- `--extract-only` — return raw transcript/text (no summarization); useful for YouTube transcripts
- `--youtube auto` — enables Apify fallback if `APIFY_API_TOKEN` is set
- `--max-output-tokens <n>` — cap output length

## YouTube: transcript vs summary

If the user asks for a **transcript**:
```bash
summarize "https://youtu.be/..." --youtube auto --extract-only
```
If the transcript is very long, return a tight summary first and ask which section to expand.

If the user asks for a **summary**:
```bash
summarize "https://youtu.be/..." --youtube auto --length medium
```

## API key

`summarize` uses `GEMINI_API_KEY` by default (model: `google/gemini-2.5-flash-preview`).

Set `GEMINI_API_KEY` in NanoClaw's `.env` file. The key is automatically passed into the container and available to `summarize`.

Other supported providers (set the relevant key in `.env`):
- `OPENAI_API_KEY` → `--model openai/gpt-4.1-mini`
- `XAI_API_KEY` → `--model xai/grok-3-mini`

## Note format

The saved note should follow this structure:

```markdown
---
source: https://...
date: 2026-02-24
tags: [incoming, summarize]
---

# Title

<summary paragraphs>
```

Keep the note in pure markdown — no extra commentary outside the frontmatter and summary.
