#!/usr/bin/env bash
# Static checks for change 2026-10-14 (refactor + UI polish). Run from the app root on the merged build.
# Usage: bash reports/changes/frontend-checks.sh [base-ref, default master]   Prints PASS/FAIL per check id.
# Contains no secrets. S3 requires `npm run build` (done here); S6 needs network for npm audit.
BASE="${1:-master}"; ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
fail=0
res() { if [ "$2" = ok ]; then echo "PASS $1"; else echo "FAIL $1 :: $3"; fail=1; fi; }

# A3: protected areas have no diff (merge-base form so only this change counts)
d=$(git diff --stat "$BASE"...HEAD -- backend frontend/src/api frontend/src/auth)
[ -z "$d" ] && res A3 ok || res A3 bad "$d"

# S1
m=$(grep -rnE 'dangerouslySetInnerHTML|innerHTML|eval\(' frontend/src)
[ -z "$m" ] && res S1 ok || res S1 bad "$m"

# S4: only SVG xmlns allowed
m=$(grep -rnE 'https?://' frontend/src/styles frontend/index.html frontend/src/components frontend/src/notifications 2>/dev/null | grep -v 'www.w3.org/2000/svg')
[ -z "$m" ] && res S4 ok || res S4 bad "$m"

# U9: no raw colour literals outside tokens.css
m=$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' frontend/src/styles/index.css)
[ -z "$m" ] && res U9 ok || res U9 bad "$m"

# A4: no new dependencies / no inline style from data (only --toast-duration allowed)
d=$(git diff "$BASE"...HEAD -- frontend/package.json backend/pom.xml)
[ -z "$d" ] && res A4-deps ok || res A4-deps bad "package.json/pom.xml changed"
m=$(grep -rnE 'style=\{' frontend/src --include=*.tsx | grep -v '\.test\.' | grep -v -- '--toast-duration')
[ -z "$m" ] && res F3-inline-style ok || res F3-inline-style bad "$m"

# no toast/message persistence in storage or URL
m=$(grep -rnE 'localStorage|sessionStorage' frontend/src/notifications)
[ -z "$m" ] && res N-storage ok || res N-storage bad "$m"

# S3 + S6 (need frontend deps installed)
( cd frontend && npm run build >/dev/null 2>&1 ) && b=ok || b=bad
[ $b = ok ] && res A2-build ok || res A2-build bad "npm run build failed"
m=$(grep -rniE 'secret|password=|api[_-]?key|Bearer ' frontend/dist 2>/dev/null)
[ -z "$m" ] && res S3 ok || res S3 bad "matches in dist (triage: framework strings vs secrets): $(echo "$m" | cut -c1-200 | head -5)"
( cd frontend && npm audit --audit-level=high >/dev/null 2>&1 ) && res S6 ok || res S6 bad "npm audit reported high/critical"
exit $fail
