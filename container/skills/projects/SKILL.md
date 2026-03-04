---
name: projects
description: Manage James's personal projects in Obsidian. Use for creating new projects, listing active projects, suggesting next actions across projects, and suggesting new projects to start. Trigger on anything about projects, what to work on, what's on the plate, next steps, or project reviews.
allowed-tools: Bash(notesmd-cli *)
---

# Project Management in Obsidian

Projects live at `/home/nanobot/src/james_notes/Projects/`. Each project is a **folder** containing a main note and a Diary.

## Project philosophy (Forte's PARA)

- A project has a **clear goal** and a **deadline** — if it has neither, it's an Area, not a project.
- Maintain **10–15 active projects**: fewer means not enough momentum; more means nothing gets finished.
- "False projects" to avoid: dreams (no timeline), hobbies (no outcome), ongoing areas (never done).
- Big projects should be broken into smaller sub-projects that complete in weeks, not months.

## Folder structure

```
Projects/
  Will Party/
    Will Party.md      ← main project note
    Diary.md           ← running diary/log
  Next Job Choice/
    Next Job.md
    Diary.md
  ...
```

## Project note template

When creating a project, use this exact template for the main note:

```markdown
---
date-created: YYYY-MM-DD
date-modified: YYYY-MM-DD
title: PROJECT_NAME
tags: Project
status: In Progress
goal: "One sentence: the specific outcome you want to achieve."
deadline: YYYY-MM-DD
area-link: "[[Areas/AREA_NAME]]"
resource-link: "[[Resources/]]"
---

# PROJECT_NAME

## Goal & Scope
- **Goal:** GOAL
- **Deadline:** DEADLINE
- **Status:** In Progress

## Next Actions
```tasks
description includes [[PROJECT_NAME]]
not done
hide tags
hide backlink
` ` `

## Details & Notes



---
## Linked Areas & Resources
- **Related Area(s):** [[Areas/AREA_NAME]]
- **Related Resource(s):** [[Resources/]]
```

The Diary note template:

```markdown
# PROJECT_NAME Diary

## YYYY-MM-DD
-
```

## Available Areas

Areas live at `Projects/../Areas/`. Current areas include:
ADHD and Exec Function, Career, Cooking, Finances, Health, Holiday Planning, Home stuff, Kids, Personal Development, Relationship, Reliability, Things to do, 2nd brain (or obsidian)

## How tasks work

Tasks are Obsidian markdown checkboxes. The Tasks plugin queries them by looking for `[[ProjectName]]` in the task description. So a task linked to "Will Party" looks like:

```markdown
- [ ] Book venue [[Will Party]] 📅 2026-03-08
```

Please put any tasks you create in the `Google Tasks/Obsidian.md` file

---

## 1. Create a new project

Ask the user for: project name, goal (one sentence), deadline, and which Area it belongs to.

Then create two files:

```bash
TODAY=$(date +%Y-%m-%d)
PROJECT="Project Name"
GOAL="Specific outcome to achieve"
DEADLINE="2026-04-01"
AREA="Career"

notesmd-cli create "Projects/${PROJECT}/${PROJECT}" -c "---
date-created: ${TODAY}
date-modified: ${TODAY}
title: ${PROJECT}
tags: Project
status: In Progress
goal: \"${GOAL}\"
deadline: ${DEADLINE}
area-link: \"[[Areas/${AREA}]]\"
resource-link: \"[[Resources/]]\"
---

# ${PROJECT}

## Goal & Scope
- **Goal:** ${GOAL}
- **Deadline:** ${DEADLINE}
- **Status:** In Progress

## Next Actions
\`\`\`tasks
description includes [[${PROJECT}]]
not done
hide tags
hide backlink
\`\`\`

## Details & Notes



---
## Linked Areas & Resources
- **Related Area(s):** [[Areas/${AREA}]]
- **Related Resource(s):** [[Resources/]]"

notesmd-cli create "Projects/${PROJECT}/Diary" -c "# ${PROJECT} Diary

## ${TODAY}
- Project started.
"
```

Confirm to the user: project created at `Projects/ProjectName/`.

---

## 2. List projects

Read all project folders and their frontmatter:

```bash
notesmd-cli list "Projects"
```

This returns the folder/file tree. Then read the main note for each project to get its frontmatter:

```bash
notesmd-cli frontmatter "Projects/Will Party/Will Party" --print
```

Summarise as a table with: project name, goal (truncated), deadline, status. Group by status (In Progress / On Hold / Not Started). Flag any with past deadlines.

---

## 3. Suggest next actions across projects

This is a **weekly review** style prompt. Do the following:

1. List all projects and read their main notes (goal, deadline, status, details)
2. Search for open tasks linked to each project:
   ```bash
   notesmd-cli tasks --today
   # Or search across vault:
   notesmd-cli search-content "- [ ]"
   ```
3. Check when each project's Diary was last updated (recency signal):
   ```bash
   notesmd-cli print "Projects/PROJECT/Diary"
   ```
4. Then reason:
   - Which projects are **stalled** (no recent diary entries, no open tasks)?
   - Which have **imminent deadlines**?
   - Which have open tasks that are **overdue**?
   - Which are stuck and need a **next action defined**?

Respond with a prioritised list: project name → specific next action to take. Be concrete ("Book the venue for Will's party" not "work on Will Party"). Flag anything overdue or deadline-approaching in bold.

---

## 4. Suggest new projects

1. List current active projects and count them
2. List all Areas:
   ```bash
   notesmd-cli list "Areas"
   ```
3. Cross-reference: which Areas have no active project?
4. Read any relevant notes for context

Then apply Forte's rules:
- Are there fewer than 10 active projects? Suggest filling up to 10–15.
- Is anything in an Area that has no current project? Flag it.
- Are there "mega-projects" (vague, no deadline) that should be broken down?
- Any recurring things the user does that could be made into a concrete project?

Suggest 3–5 specific project ideas with a draft goal and realistic deadline. For each: name, one-sentence goal, suggested deadline, which Area it belongs to.

Keep suggestions grounded in what you know about the user — don't invent areas they haven't mentioned.
