#!/bin/zsh
cd "${0:A:h}" || exit 1
exec node scripts/start-preview-3364.mjs
