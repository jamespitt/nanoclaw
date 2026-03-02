/**
 * Cron config seeder — syncs config/cron.json into the scheduled_tasks DB on startup.
 *
 * Tasks are identified by a stable DB ID derived from the config ID ("cron-config-<id>").
 * On each startup:
 *   - New tasks in config are created
 *   - Changed tasks (prompt or schedule) are updated and reactivated
 *   - Tasks removed from config are paused (not deleted, to preserve run history)
 */
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';
import path from 'path';

import { TIMEZONE } from './config.js';
import { createTask, getAllTasks, getTaskById, updateTask } from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

interface CronConfigTask {
  id: string;
  prompt: string;
  schedule: string;       // Standard cron expression, e.g. "0 9 * * 1"
  group?: string;         // Folder name (e.g. "main") or JID. Defaults to "main".
  context_mode?: 'group' | 'isolated'; // Default: "isolated"
}

interface CronConfig {
  tasks: CronConfigTask[];
}

const CONFIG_TASK_PREFIX = 'cron-config-';
const CONFIG_PATH = path.join(process.cwd(), 'config', 'cron.json');

function resolveGroup(
  groupSpec: string | undefined,
  registeredGroups: Record<string, RegisteredGroup>,
): { jid: string; folder: string } | null {
  const spec = groupSpec ?? 'main';

  // Match by folder name (most common: "main")
  for (const [jid, group] of Object.entries(registeredGroups)) {
    if (group.folder === spec) return { jid, folder: group.folder };
  }

  // Match by JID
  if (registeredGroups[spec]) {
    return { jid: spec, folder: registeredGroups[spec].folder };
  }

  return null;
}

export function seedCronTasks(registeredGroups: Record<string, RegisteredGroup>): void {
  if (!fs.existsSync(CONFIG_PATH)) {
    logger.debug({ path: CONFIG_PATH }, 'No cron.json found, skipping seeder');
    return;
  }

  let config: CronConfig;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (err) {
    logger.error({ err, path: CONFIG_PATH }, 'Failed to parse config/cron.json');
    return;
  }

  if (!Array.isArray(config.tasks)) {
    logger.warn({ path: CONFIG_PATH }, 'config/cron.json: "tasks" must be an array');
    return;
  }

  const configIds = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const task of config.tasks) {
    if (!task.id || !task.prompt || !task.schedule) {
      logger.warn({ task }, 'Cron task missing required fields (id, prompt, schedule), skipping');
      continue;
    }

    const dbId = `${CONFIG_TASK_PREFIX}${task.id}`;
    configIds.add(dbId);

    const target = resolveGroup(task.group, registeredGroups);
    if (!target) {
      logger.warn({ taskId: task.id, group: task.group }, 'Cron task: group not found, skipping');
      continue;
    }

    let nextRun: string | null;
    try {
      nextRun = CronExpressionParser.parse(task.schedule, { tz: TIMEZONE }).next().toISOString();
    } catch (err) {
      logger.error({ taskId: task.id, schedule: task.schedule, err }, 'Cron task: invalid cron expression');
      continue;
    }

    const existing = getTaskById(dbId);
    if (existing) {
      const needsUpdate =
        existing.prompt !== task.prompt ||
        existing.schedule_value !== task.schedule ||
        existing.status === 'paused';

      if (needsUpdate) {
        updateTask(dbId, {
          prompt: task.prompt,
          schedule_value: task.schedule,
          next_run: nextRun,
          status: 'active',
        });
        updated++;
        logger.info({ taskId: dbId, schedule: task.schedule }, 'Cron config task updated');
      }
    } else {
      createTask({
        id: dbId,
        group_folder: target.folder,
        chat_jid: target.jid,
        prompt: task.prompt,
        schedule_type: 'cron',
        schedule_value: task.schedule,
        context_mode: task.context_mode ?? 'isolated',
        next_run: nextRun,
        status: 'active',
        created_at: new Date().toISOString(),
      });
      created++;
      logger.info({ taskId: dbId, schedule: task.schedule }, 'Cron config task created');
    }
  }

  // Pause tasks that were removed from config (preserve run history)
  let paused = 0;
  for (const task of getAllTasks()) {
    if (task.id.startsWith(CONFIG_TASK_PREFIX) && !configIds.has(task.id) && task.status === 'active') {
      updateTask(task.id, { status: 'paused' });
      paused++;
      logger.info({ taskId: task.id }, 'Cron config task paused (removed from config)');
    }
  }

  if (created > 0 || updated > 0 || paused > 0) {
    logger.info({ created, updated, paused }, 'Cron config seeded');
  }
}
