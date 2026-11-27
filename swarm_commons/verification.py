import shlex
import subprocess
import uuid

from .client import SwarmError
from .local import safe_env


def verify(workspace, image, test_command, *, git_dir=None):
    if not image or not test_command:
        return [{"command": "Project test command was not configured", "outcome": "not_run"}]
    try:
        words = shlex.split(test_command)
    except ValueError:
        raise SwarmError("Invalid test-command quoting.") from None
    if not words or not image[0].isalnum():
        raise SwarmError("Use a trusted local Docker image and a nonempty test command.")
    name = "swarm-verify-" + uuid.uuid4().hex
    git_mount = [
        "--mount", f"type=bind,source={git_dir},target={git_dir},readonly",
        "--env", "GIT_CONFIG_COUNT=1", "--env", "GIT_CONFIG_KEY_0=safe.directory",
        "--env", "GIT_CONFIG_VALUE_0=/workspace",
    ] if git_dir is not None else []
    command = [
        "docker", "run", "--rm", "--pull=never", "--network=none", "--cap-drop=ALL",
        "--name", name,
        "--security-opt=no-new-privileges", "--read-only", "--pids-limit=256", "--memory=1g", "--cpus=2",
        "--user=65534:65534", "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777",
        "--mount", f"type=bind,source={workspace},target=/workspace,readonly", "--workdir", "/workspace",
        *git_mount,
        "--entrypoint", words[0], image, *words[1:],
    ]
    try:
        result = subprocess.run(command, env=safe_env(), stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SwarmError("Could not complete the sandboxed verification.") from exc
    finally:
        try:
            subprocess.run(("docker", "rm", "-f", name), env=safe_env(),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            pass
    return [{"command": test_command, "outcome": "passed" if result.returncode == 0 else "failed"}]
