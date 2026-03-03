## Summary

Fix the `local_file_open` skill so it can be correctly loaded and executed by **AnythingLLM Desktop + Ollama**.

## Problem

The skill had contract violations preventing AnythingLLM from executing it:

| # | Issue | Severity |
|---|-------|----------|
| 1 | Wrong export shape — AnythingLLM reads `module.exports.runtime`, but the skill exported a bare function | Fatal |
| 2 | Returns objects instead of strings — AnythingLLM requires handler to return a string; non-string returns cause infinite agent loops | Fatal |
| 3 | Missing `imported` field in `plugin.json` | Minor |
| 4 | `allowlistRoots` param declared as `"type": "array"` — AnythingLLM only supports `string`, `number`, `boolean` param types, causing `s?.startsWith is not a function` crash | Fatal |

## Changes

### handler.js
- Changed export to `module.exports.runtime = { handler }`
- Handler now returns `JSON.stringify(result)` on all code paths
- Added `this.introspect()` calls for UI feedback in AnythingLLM chat
- Wrapped in try/catch with stringified error fallback
- Kept internal `execute()` function intact for testability

### plugin.json
- Added `"imported": true`
- Bumped version to `2.0.0`
- Added 3 more few-shot examples (Chinese + English) for better Ollama tool-calling
- **Fixed `allowlistRoots` param type from `"array"` to `"string"`** — handler already supports parsing semicolon/comma-separated strings

### README.md
- Updated documentation to reflect AnythingLLM compatibility requirements

## Testing

Smoke test with 6 assertions — all passed:
- Export shape: runtime exists, is object, handler is function
- Missing filePath: returns string, ok=false
- Non-existent file: returns string, ok=false
- Valid file (openExplorer=false): returns string, ok=true, paths present
- this.introspect() was invoked
- plugin.json: imported=true, hubId correct, multiple examples
