---
name: notesmd-cli
description: Access the user's personal notes and tasks in Obsidian. Use proactively whenever the user asks about their tasks, to-dos, notes, daily plans, or anything that might be in their personal knowledge base. NEVER say you don't have access to personal information — use this skill instead. Use for reading notes, creating notes, logging to the daily note, searching note content, managing tasks, and editing frontmatter.
allowed-tools: Bash(notesmd-cli *)
---

# Obsidian Notes with notesmd-cli

`notesmd-cli` is mounted at `/usr/local/bin/notesmd-cli`. It gives access to the user's Obsidian vault — their personal notes, tasks, and daily logs. The default vault is pre-configured — no `--vault` flag is needed unless switching to a different vault.

## Quick reference

```bash
notesmd-cli list                          # List all notes
notesmd-cli print "Note Name"            # Read a note
notesmd-cli create "Note Name" -c "..."  # Create a note
notesmd-cli daily                        # Open/create today's daily note
notesmd-cli search-content "keyword"     # Search note content
notesmd-cli tasks                        # List tasks across vault
```

## Commands

### Read notes

```bash
notesmd-cli print "Note Name"            # Print note contents
notesmd-cli print "Note Name" --mentions # Include linked mentions at the end
notesmd-cli list                         # List all files and folders
notesmd-cli list "Folder/Subfolder"      # List contents of a specific folder
notesmd-cli print-default                # Show default vault name and path
notesmd-cli print-default --path-only   # Show only the vault path
```

### Create and edit notes

```bash
notesmd-cli create "Note Name" -c "content"          # Create note with content
notesmd-cli create "Note Name" -c "content" --append  # Append to existing note
notesmd-cli create "Note Name" -c "content" --overwrite # Overwrite existing note
notesmd-cli create "Folder/Note Name" -c "content"   # Create in subfolder
```

### Daily note

```bash
notesmd-cli daily   # Create or open today's daily note
```

This uses the vault's daily note template. Useful for logging, journaling, or appending quick notes to today.

To append to today's daily note, use `create` with the daily note's filename:

```bash
DATE=$(date +%Y-%m-%d)
notesmd-cli create "$DATE" -c "- New log entry" --append
```

### Search

```bash
notesmd-cli search-content "search term"         # Search note content (full text)
notesmd-cli search "partial note name"           # Fuzzy search note names
```

`search-content` returns matching notes and the lines that match.

### Move and delete

```bash
notesmd-cli move "Old Name" "New Name"           # Rename note (updates all links)
notesmd-cli move "Note" "Folder/Note"            # Move to folder (updates all links)
notesmd-cli delete "Note Name"                   # Delete a note
```

### Frontmatter

```bash
notesmd-cli frontmatter "Note Name" --print                    # View all frontmatter
notesmd-cli frontmatter "Note Name" --edit --key "status" --value "done"  # Set a key
notesmd-cli frontmatter "Note Name" --delete --key "draft"     # Remove a key
```

Frontmatter is YAML at the top of a note, e.g. `tags`, `status`, `date`.

### Tasks

```bash
notesmd-cli tasks                           # All tasks in vault
notesmd-cli tasks --today                   # Tasks tagged "today" or scheduled for today (shorthand)
notesmd-cli tasks --tag "work"              # Filter by tag
notesmd-cli tasks --date 2026-02-19         # Tasks scheduled for a date
notesmd-cli tasks --from 2026-02-01 --to 2026-02-28  # Date range
notesmd-cli tasks --folder "Projects"       # Limit to a folder
notesmd-cli tasks --tag "work" --tag "urgent"  # Multiple tags (OR logic)
```

`--today` is shorthand for `--tag today --date <today>` — it returns tasks tagged "today" or scheduled for the current date.

Tasks are markdown checkboxes: `- [ ] Task text`. Scheduled dates use `📅 YYYY-MM-DD` syntax (Tasks plugin convention).

## Using a non-default vault

```bash
notesmd-cli list --vault "My Other Vault"
notesmd-cli print "Note Name" --vault "My Other Vault"
```

## Examples

### Read and summarise a note

```bash
notesmd-cli print "Meeting Notes/2026-02-19"
```

### Append a log entry to today's daily note

```bash
notesmd-cli create "$(date +%Y-%m-%d)" -c "\n## Agent log\n- Did the thing" --append
```

### Find notes about a topic

```bash
notesmd-cli search-content "quarterly review"
```

### Check what tasks are due today

```bash
notesmd-cli tasks --today
```

### Create a note in a specific folder

```bash
notesmd-cli create "Projects/New Idea" -c "# New Idea\n\nDetails here..."
```

### Mark a task done by editing the note

```bash
# Read the note, find the task line, rewrite with [x]
content=$(notesmd-cli print "My Tasks")
# Then use Write or Edit tool on the vault file directly if needed
notesmd-cli print-default --path-only  # Get vault root path
```
