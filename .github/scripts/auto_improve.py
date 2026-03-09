#!/usr/bin/env python3
"""
Auto-improve script: calls the Claude API to pick one open TODO item,
implement it, and write the changed files back to disk.
The GitHub Actions workflow then runs tests/build and commits.
"""

import os
import json
import subprocess
import urllib.request
import urllib.error

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not API_KEY:
    raise SystemExit("ANTHROPIC_API_KEY is not set")


def read_file(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def get_src_listing() -> str:
    result = subprocess.run(
        ["find", "src", "-type", "f", "(",
         "-name", "*.ts", "-o", "-name", "*.tsx", ")"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def call_claude(prompt: str) -> str:
    payload = json.dumps({
        "model": "claude-opus-4-6",
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())["content"][0]["text"].strip()


def parse_json_response(text: str) -> dict:
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1])
    return json.loads(text)


def mark_done_in_todo(task_line_fragment: str) -> None:
    """Replace `- [ ] <task>` with `- [x] <task>` in TODO.md."""
    todo_path = "TODO.md"
    content = read_file(todo_path)
    if not content:
        return
    lines = content.splitlines()
    updated = []
    for line in lines:
        if line.startswith("- [ ]") and task_line_fragment.lower() in line.lower():
            line = line.replace("- [ ]", "- [x]", 1)
        updated.append(line)
    with open(todo_path, "w", encoding="utf-8") as f:
        f.write("\n".join(updated) + "\n")


def main() -> None:
    todo = read_file("TODO.md")
    types_ts = read_file("src/engine/types.ts")
    initial_state = read_file("src/engine/initialState.ts")
    config_ts = read_file("src/config.ts")
    src_listing = get_src_listing()

    prompt = f"""You are an autonomous developer improving an Ancient Warring States strategy game.
Tech stack: React 18, TypeScript, Vite, Zustand, Tailwind CSS.

## Open tasks in TODO.md (lines with `- [ ]`)

{todo}

## Source file listing
{src_listing}

## src/engine/types.ts
```typescript
{types_ts}
```

## src/engine/initialState.ts
```typescript
{initial_state}
```

## src/config.ts
```typescript
{config_ts}
```

---

Your job:
1. Pick exactly ONE open `- [ ]` item from the TODO.md above — prefer bugs first, then "Next Up" tasks.
2. Implement it by modifying the minimal set of source files (at most 3 files).
3. Also include TODO.md in your output with that item changed from `- [ ]` to `- [x]`.

Respond with ONLY valid JSON — no explanation, no markdown, just the JSON object:

{{
  "task": "short human-readable description of what you implemented (≤ 80 chars)",
  "files": [
    {{"path": "src/path/to/file.tsx", "content": "...complete file content..."}},
    {{"path": "TODO.md", "content": "...updated TODO.md with the task checked off..."}}
  ]
}}

Constraints:
- Output COMPLETE file contents, not diffs or partial snippets.
- Do not touch files you are not confident about.
- If a task needs a file you cannot see, pick a different task.
- The task must compile cleanly with TypeScript strict mode.
"""

    print("Calling Claude API…")
    raw = call_claude(prompt)

    data = parse_json_response(raw)
    task: str = data["task"]
    files: list = data["files"]

    print(f"Implementing: {task}")
    print(f"Files to write: {[f['path'] for f in files]}")

    for entry in files:
        path: str = entry["path"]
        content: str = entry["content"]
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        print(f"  Wrote: {path}")

    # If TODO.md wasn't part of Claude's file list, mark it done ourselves
    if not any(f["path"] == "TODO.md" for f in files):
        mark_done_in_todo(task)
        print("  Marked task done in TODO.md (fallback)")

    # Save task description for the git commit message
    with open(".auto_improve_task.txt", "w", encoding="utf-8") as f:
        f.write(task)

    print("Done.")


if __name__ == "__main__":
    main()
