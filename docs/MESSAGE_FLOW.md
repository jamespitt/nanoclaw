# NanoClaw: Message Flow

What happens from the moment you send a WhatsApp message until the agent replies.

---

## Architecture Overview

```
WhatsApp ──► Baileys ──► SQLite DB ──► Message Loop ──► GroupQueue
                                                              │
                                                              ▼
                                                       Docker Container
                                                       (Claude Agent SDK)
                                                              │
                                                              ▼
                                                     Result ──► WhatsApp
```

There's a single Node.js host process (`src/index.ts`) that owns the WhatsApp connection, the database, and the queue. Each group's Claude agent runs inside an isolated Docker container.

---

## Step-by-Step Flow

### 1. Message Received by Baileys (`src/channels/whatsapp.ts`)

The Baileys library maintains a persistent WebSocket to WhatsApp's servers. When your message arrives:

- The `messages.upsert` event fires
- JID translation happens (WhatsApp sometimes uses LID identifiers instead of phone numbers)
- `onChatMetadata()` is called for every group (for group discovery)
- For **registered groups only**: the message is converted to a `NewMessage` and passed to `storeMessage()`, which writes it to SQLite

```
{ id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message }
```

### 2. Message Stored in SQLite (`src/db.ts`)

Every inbound message for a registered group is persisted. This means:

- Messages survive process restarts (crash recovery)
- Context accumulates between trigger invocations — the agent sees all messages since it last responded, not just the triggering message
- The host tracks two cursors:
  - `lastTimestamp` — the most recently *seen* message (stops re-processing on restart)
  - `lastAgentTimestamp[chatJid]` — the most recently *processed* message (what the agent has seen)

### 3. Message Loop Detects the Message (`src/index.ts:startMessageLoop`)

A polling loop runs every **2 seconds**. On each tick it:

1. Calls `getNewMessages()` to find messages newer than `lastTimestamp`
2. Advances `lastTimestamp` immediately (marks as seen)
3. For non-main groups: checks whether any message matches `TRIGGER_PATTERN` (`@Andy` by default)
4. If the trigger is missing, the messages accumulate in the DB and are skipped — they'll be included as context when a trigger eventually arrives

If triggered:

- Fetches all messages since `lastAgentTimestamp[chatJid]` (the full pending backlog)
- Checks `GroupQueue.sendMessage()` — if a container is **already running** for this group, the message is piped directly into it via an IPC file (no container restart needed)
- Otherwise, calls `queue.enqueueMessageCheck(chatJid)` to start a new container

### 4. GroupQueue Manages Concurrency (`src/group-queue.ts`)

The queue ensures:

- At most `MAX_CONCURRENT_CONTAINERS` (default: 5) containers run simultaneously
- Each group runs one container at a time (serialised per group)
- If a container is already active for a group and a new message arrives, it's flagged as `pendingMessages` and processed immediately after the current run completes
- Failed runs are retried with exponential backoff (up to 5 retries)

When a slot is available, `processGroupMessages(chatJid)` is called.

### 5. Message Formatting (`src/router.ts`)

Messages are formatted as XML before being sent to the agent:

```xml
<messages>
  <message sender="James" time="2026-02-19T10:00:00.000Z">@Andy can you check the weather?</message>
</messages>
```

### 6. Container Spawn (`src/container-runner.ts`)

`runContainerAgent()` prepares and launches the Docker container:

**Volume mounts built:**

| Host Path | Container Path | Access |
|-----------|---------------|--------|
| `groups/{folder}/` | `/workspace/group` | read-write |
| `groups/global/` | `/workspace/global` | read-only (non-main) |
| `nanoclaw/` (project root) | `/workspace/project` | read-write (main only) |
| `data/sessions/{folder}/.claude/` | `/home/node/.claude` | read-write |
| `data/ipc/{folder}/` | `/workspace/ipc` | read-write |
| `container/agent-runner/src/` | `/app/src` | read-only |
| `notesmd-cli`, vault | various | read-only (if present) |

**Secrets handling:**

API keys are read from `.env` on disk, written to the container's stdin as JSON, then immediately deleted from the input object — they're never passed as environment variables or mounted files, so Bash subprocesses inside the container can't see them.

**Container launch:**

```bash
docker run -i --rm --name nanoclaw-{group}-{timestamp} \
  --user {uid}:{gid} \
  -v .../group:/workspace/group \
  ... (all mounts) \
  nanoclaw-agent:latest
```

A hard timeout (default 30 min + idle timeout grace) kills stuck containers. Typing indicators are shown in WhatsApp while the container runs.

### 7. Agent Runner Starts (`container/agent-runner/src/index.ts`)

Inside the container, the agent runner:

1. Reads the `ContainerInput` JSON from stdin
2. Merges secrets into the SDK environment only (not `process.env`)
3. Creates a `MessageStream` (an async iterable) and pushes the initial prompt
4. Calls `query()` from the **Claude Agent SDK** with:
   - CWD: `/workspace/group` (the group's isolated filesystem)
   - Session resume: existing session ID if present (conversation continuity)
   - Allowed tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Task`, `TodoWrite`, `Skill`, `NotebookEdit`, `mcp__nanoclaw__*`
   - MCP server: the `nanoclaw` MCP server (for IPC — sending messages, scheduling tasks)
   - `permissionMode: 'bypassPermissions'` — the agent runs all tools without confirmation
   - Hooks: `PreCompact` (archives conversation to markdown before compaction), `PreToolUse/Bash` (strips API keys from Bash subprocess environments)

5. Polls `/workspace/ipc/input/` every 500ms for follow-up messages piped in while the query is running

### 8. Claude Runs the Skill

Claude reads:
- The formatted message XML as the prompt
- `CLAUDE.md` in `/workspace/group/` (per-group memory and instructions)
- `CLAUDE.md` in `/workspace/global/` (shared instructions, read-only)
- Any additional mounted CLAUDE.md files

For a complex skill, Claude may:
- Run Bash commands (search the web, read files, call APIs)
- Use file tools (Read, Write, Edit, Glob, Grep)
- Spawn subagents (Task tool) for parallel work
- Use the `nanoclaw` MCP tools to schedule tasks or send messages to other groups
- Use the Skill tool to invoke named skills (e.g., browsing, notes)

### 9. Results Stream Back (`container/agent-runner/src/index.ts → container-runner.ts`)

Each time the Claude SDK emits a `result` message:

1. The agent runner wraps it in sentinel markers and writes to stdout:
   ```
   ---NANOCLAW_OUTPUT_START---
   {"status":"success","result":"Here's the weather...","newSessionId":"abc123"}
   ---NANOCLAW_OUTPUT_END---
   ```

2. The host parses these in real-time from the container's stdout stream

3. The `onOutput` callback fires in `processGroupMessages()`:
   - `<internal>...</internal>` blocks are stripped (agent's private reasoning)
   - The result text is sent to WhatsApp via `whatsapp.sendMessage()`
   - The typing indicator is reset

4. The session ID is saved to SQLite so the next invocation can resume this conversation

### 10. Container Stays Alive (Idle Mode)

After sending a result, the container **doesn't exit**. It waits for more messages.

- The host starts an idle timer (default: 30 minutes)
- If another message arrives within the idle window, it's written as a file to `/workspace/ipc/{group}/input/`
- The agent runner polls this directory and pipes the message directly into the running SDK query — no container restart, no session break
- When the idle timer fires, `closeStdin()` writes a `_close` sentinel file
- The agent runner detects `_close`, ends the `MessageStream`, and the SDK call returns cleanly
- The container exits (`--rm` cleans it up)

### 11. IPC: Agent → Host (`src/ipc.ts`)

If the agent uses NanoClaw MCP tools (e.g., to schedule a task), the MCP server writes JSON files to `/workspace/ipc/{group}/tasks/` or `/workspace/ipc/{group}/messages/`.

The host's IPC watcher polls these directories every second and processes them:

| IPC type | What it does |
|----------|-------------|
| `message` | Send a WhatsApp message to a target group (authorised groups only) |
| `schedule_task` | Create a recurring or one-off scheduled task in SQLite |
| `pause_task` / `resume_task` / `cancel_task` | Manage existing tasks |
| `refresh_groups` | Re-sync group metadata from WhatsApp (main group only) |
| `register_group` | Activate a new WhatsApp group (main group only) |

Non-main groups can only send to themselves and can only schedule tasks for themselves.

---

## Key Design Decisions

**Why Docker?** Isolation — each group gets its own filesystem, session store, and IPC namespace. Containers can't access each other's data.

**Why polling SQLite instead of event-driven?** Crash resilience. If the host restarts mid-processing, `recoverPendingMessages()` re-queues any messages that were seen but not yet processed.

**Why IPC files instead of stdin for follow-ups?** The Claude Agent SDK's `query()` call is a long-running async loop. Files let the host push new messages into a running query without restarting the process or session.

**Why keep the container alive after responding?** Session continuity. Resuming a running session is faster and preserves richer context than starting fresh. The 30-minute idle window handles conversational follow-ups naturally.

**Why strip `<internal>` blocks?** The agent uses these tags for private reasoning it doesn't want sent to the user — tool planning, intermediate thoughts, etc.
