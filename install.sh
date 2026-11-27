#!/bin/sh
set -eu

source=${1:-git+https://github.com/slainhedden/swarm-commons.git}
if command -v uv >/dev/null 2>&1; then
    exec uv tool install --from "$source" swarm-commons
elif command -v pipx >/dev/null 2>&1; then
    exec pipx install "$source"
else
    printf '%s\n' 'Install uv (https://docs.astral.sh/uv/) or pipx (https://pipx.pypa.io/) first.' >&2
    exit 1
fi
