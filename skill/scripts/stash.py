#!/usr/bin/env python3
"""stash — talk to your private key/value Worker using the baked-in .env.

This file ships inside the minted `.skill`. The accompanying `.env` (baked by
the Worker at download time) supplies API_BASE / API_KEY / USER_EMAIL, so the
agent never sees or types a credential — it just runs the verbs.
"""
import json
import os
import sys
import urllib.error
import urllib.request

PREFIX = "stashk_"


def load_env() -> dict:
    """Config from process env, else the .env next to this skill."""
    cfg = {}
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(here, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                cfg.setdefault(key.strip(), val.strip())
    for key in ("API_BASE", "API_KEY", "USER_EMAIL"):
        if os.environ.get(key):
            cfg[key] = os.environ[key]
    return cfg


def call(cfg: dict, method: str, path: str, body: bytes | None = None):
    url = cfg["API_BASE"].rstrip("/") + path
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + cfg["API_KEY"])
    req.add_header("X-User-Email", cfg["USER_EMAIL"])
    # An explicit UA is required: Cloudflare's edge blocks the default
    # "Python-urllib/x.y" agent with a 403 (error 1010) before the request
    # ever reaches the Worker.
    req.add_header("User-Agent", "stash-skill/1.0 (+https://github.com/htlin222/skill-with-secret)")
    if body is not None:
        req.add_header("Content-Type", "text/plain")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        try:
            detail = json.loads(detail)
        except Exception:
            pass
        return e.code, detail


def die(status, detail):
    msg = detail.get("error") if isinstance(detail, dict) else detail
    if status == 401:
        sys.stderr.write(
            "401: this skill was revoked (key rotated). Re-download stash.skill "
            "from the console and unzip it again.\n"
        )
    else:
        sys.stderr.write(f"{status}: {msg}\n")
    sys.exit(1)


def main(argv):
    cfg = load_env()
    missing = [k for k in ("API_BASE", "API_KEY", "USER_EMAIL") if not cfg.get(k)]
    if missing:
        sys.stderr.write(
            "Missing config: " + ", ".join(missing) + ". This skill ships a "
            "baked .env — re-download stash.skill from the console.\n"
        )
        sys.exit(2)

    if not argv:
        sys.stderr.write("usage: stash {put|get|ls|rm|whoami} ...\n")
        sys.exit(2)

    cmd, rest = argv[0], argv[1:]

    if cmd == "whoami":
        print(f"{cfg['USER_EMAIL']} → {cfg['API_BASE']}")
        print(f"key {cfg['API_KEY'][:len(PREFIX) + 8]}… (masked)")
        return

    if cmd == "ls":
        status, body = call(cfg, "GET", "/api/kv")
        if status != 200:
            die(status, body)
        for k in body.get("keys", []):
            print(k)
        return

    if cmd == "get":
        if not rest:
            sys.stderr.write("usage: stash get KEY\n"); sys.exit(2)
        status, body = call(cfg, "GET", "/api/kv/" + rest[0])
        if status != 200:
            die(status, body)
        print(body.get("value", ""))
        return

    if cmd == "put":
        if len(rest) < 2:
            sys.stderr.write("usage: stash put KEY VALUE\n"); sys.exit(2)
        value = " ".join(rest[1:]).encode()
        status, body = call(cfg, "PUT", "/api/kv/" + rest[0], value)
        if status != 200:
            die(status, body)
        print("ok")
        return

    if cmd == "rm":
        if not rest:
            sys.stderr.write("usage: stash rm KEY\n"); sys.exit(2)
        status, body = call(cfg, "DELETE", "/api/kv/" + rest[0])
        if status != 200:
            die(status, body)
        print("ok")
        return

    sys.stderr.write(f"unknown command: {cmd}\n")
    sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
