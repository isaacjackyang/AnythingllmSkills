#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_table(db_uri: str, table_name: str):
    import lancedb
    db = lancedb.connect(db_uri)
    schema = [
        {"name": "id", "type": "string"},
        {"name": "scope", "type": "string"},
        {"name": "kind", "type": "string"},
        {"name": "content", "type": "string"},
        {"name": "metadata", "type": "string"},
        {"name": "created_at", "type": "string"},
    ]
    names = db.table_names()
    if table_name not in names:
      db.create_table(table_name, data=[{
          "id": "bootstrap",
          "scope": "system",
          "kind": "bootstrap",
          "content": "initialized",
          "metadata": "{}",
          "created_at": now_iso(),
      }], mode="overwrite")
    return db.open_table(table_name)


def cmd_ensure(payload):
    db_uri = payload["db_uri"]
    table = payload.get("table", "agent_memory")
    ensure_table(db_uri, table)
    return {"ok": True, "message": "lancedb table ensured"}


def cmd_upsert(payload):
    db_uri = payload["db_uri"]
    table = payload.get("table", "agent_memory")
    row = payload["row"]
    t = ensure_table(db_uri, table)
    t.add([{
        "id": row["id"],
        "scope": row.get("scope", "default"),
        "kind": row.get("kind", "note"),
        "content": row.get("content", ""),
        "metadata": json.dumps(row.get("metadata", {}), ensure_ascii=False),
        "created_at": row.get("created_at", now_iso()),
    }])
    return {"ok": True, "message": "memory row inserted"}


def cmd_search(payload):
    db_uri = payload["db_uri"]
    table = payload.get("table", "agent_memory")
    query = str(payload.get("query", "")).lower().strip()
    limit = int(payload.get("limit", 20))
    t = ensure_table(db_uri, table)
    rows = t.to_pydict()
    items = []
    for i in range(len(rows.get("id", []))):
        content = str(rows["content"][i])
        if query and query not in content.lower():
            continue
        items.append({
            "id": rows["id"][i],
            "scope": rows["scope"][i],
            "kind": rows["kind"][i],
            "content": content,
            "metadata": json.loads(rows["metadata"][i] or "{}"),
            "created_at": rows["created_at"][i],
        })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"ok": True, "data": items[:limit]}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing command"}))
        sys.exit(1)

    command = sys.argv[1]
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        if command == "ensure":
            out = cmd_ensure(payload)
        elif command == "upsert":
            out = cmd_upsert(payload)
        elif command == "search":
            out = cmd_search(payload)
        else:
            raise ValueError(f"unknown command: {command}")
        print(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
