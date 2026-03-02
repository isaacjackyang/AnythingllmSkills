#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const required = ["id", "date", "source", "session_id", "message_range", "confidence"];

function parseDecisionBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("## Decision")) {
      if (current) blocks.push(current);
      current = { heading: line, fields: new Map() };
      continue;
    }
    if (current && line.startsWith("## ")) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const match = line.match(/^\-\s+([a-z_]+):\s*(.+)$/i);
    if (match) current.fields.set(match[1], match[2]);
  }

  if (current) blocks.push(current);
  return blocks;
}

function main() {
  const files = globSync("memory/20*.md");
  const errors = [];
  let inspected = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const blocks = parseDecisionBlocks(content);
    if (blocks.length === 0) continue;

    inspected += blocks.length;
    blocks.forEach((block, idx) => {
      const missing = required.filter((key) => !block.fields.get(key));
      if (missing.length > 0) {
        errors.push(`${file} decision#${idx + 1} missing fields: ${missing.join(", ")}`);
      }
    });
  }

  if (errors.length > 0) {
    console.error(`memory validation failed (${errors.length} errors)`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(`memory validation passed: ${inspected} decision block(s) checked`);
}

main();
