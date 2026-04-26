import os
import shlex
import sys
from pathlib import Path

import paramiko


REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_ENV_FILE = REPO_ROOT / ".env.nas"


def load_local_env() -> None:
    if not LOCAL_ENV_FILE.exists():
        return

    for line in LOCAL_ENV_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def build_remote_command(mode: str, args: list[str]) -> str:
    docker_bin = os.environ.get(
        "NAS_DOCKER_BIN", "/Volume1/@apps/DockerEngine/dockerd/bin/docker"
    )
    compose_bin = os.environ.get(
        "NAS_DOCKER_COMPOSE_BIN",
        "/Volume1/@apps/DockerEngine/dockerd/bin/docker-compose",
    )

    if mode == "docker":
        return shlex.join([docker_bin, *args])
    if mode == "compose":
        return shlex.join([compose_bin, *args])
    if mode == "shell":
        if not args:
            raise SystemExit("shell mode requires a command")
        return " ".join(args)
    raise SystemExit(f"Unknown mode: {mode}")


def main() -> int:
    load_local_env()

    if len(sys.argv) < 2:
        print(
            "Usage: python scripts/nas-docker.py [docker|compose|shell] <args...>",
            file=sys.stderr,
        )
        return 1

    host = require_env("NAS_HOST")
    user = require_env("NAS_USER")
    password = require_env("NAS_PASSWORD")
    port = int(os.environ.get("NAS_SSH_PORT", "22"))
    mode = sys.argv[1]
    args = sys.argv[2:]
    command = build_remote_command(mode, args)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=port,
        username=user,
        password=password,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )

    try:
        _, stdout, stderr = client.exec_command(command, timeout=600)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        status = stdout.channel.recv_exit_status()
    finally:
        client.close()

    if out:
        sys.stdout.write(out)
    if err:
        sys.stderr.write(err)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
