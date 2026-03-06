#!/usr/bin/env bash
# Mock infra script that fails — used by unit tests only.
echo "mock error: $0 $*" >&2
exit 1
