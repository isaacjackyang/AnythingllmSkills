#!/usr/bin/env node
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const root = process.cwd();
const memoryDir = path.join(root, 'memory');
const summariesDir = path.join(root, 'second-brain', 'summaries');
const archiveDir = path.join(memoryDir, 'archive');
const lockDir = path.join(memoryDir, '.locks');
const memoryIndexPath = path.join(root, 'MEMORY.md');

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOf(date) {
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function weekIdFromDate(date) {
  const d = new Date(date + 'T00:00:00Z');
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + yearStart.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

async function withLock(job, fn) {
  await ensureDir(lockDir);
  const lockPath = path.join(lockDir, `${job}.lock`);
  try {
    const fd = await fsp.open(lockPath, 'wx');
    await fd.writeFile(`${new Date().toISOString()}\n`);
    await fd.close();
  } catch {
    throw new Error(`job locked: ${job}`);
  }
  try {
    return await fn();
  } finally {
    await fsp.unlink(lockPath).catch(() => {});
  }
}

async function runMicrosync({ date, dryRun }) {
  const targetDate = date || todayIso();
  const file = path.join(memoryDir, `${targetDate}.md`);
  await ensureDir(memoryDir);
  let created = false;

  if (!fs.existsSync(file)) {
    created = true;
    if (!dryRun) {
      await fsp.writeFile(file, `# Daily Memory - ${targetDate}\n\n> 來源：microSync（高頻決策萃取）\n`);
    }
  }

  if (!fs.existsSync(file)) {
    return { job: 'microsync', date: targetDate, created, dedupRemoved: 0, entries: 0, dryRun };
  }

  const content = await fsp.readFile(file, 'utf8');
  const lines = content.split('\n');
  const seen = new Set();
  let dedupRemoved = 0;
  const out = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## Decision:')) {
      skipBlock = false;
    }
    const match = line.match(/^\- id:\s*(\S+)/);
    if (match) {
      const id = match[1].trim();
      if (seen.has(id)) {
        dedupRemoved += 1;
        skipBlock = true;
      } else {
        seen.add(id);
      }
    }
    if (!skipBlock) out.push(line);
  }

  if (!dryRun && dedupRemoved > 0) {
    await fsp.writeFile(file, out.join('\n'));
  }

  return {
    job: 'microsync',
    date: targetDate,
    created,
    dedupRemoved,
    entries: seen.size,
    dryRun,
    file: path.relative(root, file).replace(/\\/g, '/'),
  };
}

async function runDailyWrapup({ date, dryRun }) {
  const targetDate = date || todayIso();
  const file = path.join(summariesDir, `${targetDate}-wrapup.md`);
  await ensureDir(summariesDir);
  const exists = fs.existsSync(file);

  if (!exists && !dryRun) {
    const tpl = `# Daily Wrap-up - ${targetDate}\n\n## Decisions made today\n- \n\n## Action items\n- \n\n## Important conversations\n- \n\n## Technical notes / debugging lessons\n- \n\n## Open loops\n- \n\n## Tomorrow next steps\n- \n`;
    await fsp.writeFile(file, tpl);
  }

  return {
    job: 'daily-wrapup',
    date: targetDate,
    created: !exists,
    dryRun,
    file: path.relative(root, file).replace(/\\/g, '/'),
  };
}

async function runWeeklyCompound({ date, dryRun }) {
  const targetDate = date || todayIso();
  const weekStart = mondayOf(targetDate);
  const weekId = weekIdFromDate(targetDate);
  await ensureDir(archiveDir);

  const files = await fsp.readdir(memoryDir).catch(() => []);
  const weeklyDailyFiles = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f >= `${weekStart}.md`)
    .sort();

  let memoryLines = 0;
  if (fs.existsSync(memoryIndexPath)) {
    const memoryText = await fsp.readFile(memoryIndexPath, 'utf8');
    memoryLines = memoryText.split('\n').length;
  }

  const reportPath = path.join(archiveDir, `weekly-${weekId}.md`);
  const report = `# Weekly Compound Report - ${weekId}\n\n- week_start: ${weekStart}\n- daily_files: ${weeklyDailyFiles.length}\n- memory_md_lines: ${memoryLines}\n- note: 本報告由固定流程產生；決策內容升降級仍需人工/模型判斷。\n`;

  if (!dryRun) {
    await fsp.writeFile(reportPath, report);
  }

  return {
    job: 'weekly-compound',
    weekId,
    weekStart,
    dailyFiles: weeklyDailyFiles,
    memoryLines,
    memoryTooLarge: memoryLines > 200,
    dryRun,
    file: path.relative(root, reportPath).replace(/\\/g, '/'),
  };
}

async function main() {
  const [, , cmd, job, ...args] = process.argv;
  if (cmd !== 'run' || !job) {
    console.error('Usage: node scripts/memory_workflow.js run <microsync|daily-wrapup|weekly-compound> [--date YYYY-MM-DD] [--dry-run]');
    process.exit(2);
  }

  const options = { date: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') options.date = args[i + 1];
    if (args[i] === '--dry-run') options.dryRun = true;
  }

  let result;
  if (job === 'microsync') {
    result = await withLock('microsync', () => runMicrosync(options));
  } else if (job === 'daily-wrapup') {
    result = await withLock('daily-wrapup', () => runDailyWrapup(options));
  } else if (job === 'weekly-compound') {
    result = await withLock('weekly-compound', () => runWeeklyCompound(options));
  } else {
    throw new Error(`Unsupported job: ${job}`);
  }

  process.stdout.write(JSON.stringify({ ok: true, data: result }, null, 2));
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
