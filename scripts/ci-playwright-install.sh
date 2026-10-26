#!/usr/bin/env bash
# Usage (CI): scripts/ci-playwright-install.sh <playwright version> <browser>...
# Installs Playwright and its browsers with their system packages on a GitHub runner.
#
# The packages come from the runner's apt mirror (azure.archive.ubuntu.com), which sometimes
# serves one job at a few kB/s: the WebKit legs of the layout check need 119 MB of packages and
# then ran into the job's 40-minute timeout while their twins finished in 4 seconds. So each
# attempt gets 6 minutes; after a slow or failed one the next attempt puts another mirror first.
# apt keeps what it has already downloaded, so a retry only fetches the rest.
set -euo pipefail

version="${1:?usage: scripts/ci-playwright-install.sh <version> <browser>...}"
shift
npm i -g "playwright@${version}"

mirrors=(http://archive.ubuntu.com/ubuntu/ http://mirrors.edge.kernel.org/ubuntu/)
for attempt in 1 2 3; do
    # Its own process group, so a timeout also stops the apt-get it started.
    if timeout --kill-after=15 360 playwright install --with-deps "$@"; then
        exit 0
    fi
    [ "${attempt}" = 3 ] && break
    mirror="${mirrors[$((attempt - 1))]}"
    echo "::warning title=Playwright install::attempt ${attempt} was too slow or failed; retrying with ${mirror} first"
    # The runner's sources read their mirrors from this list (mirror+file:), first one first.
    if [ -f /etc/apt/apt-mirrors.txt ]; then
        { printf '%s\tpriority:1\n' "${mirror}"; sed 's/priority:[0-9]*/priority:2/' /etc/apt/apt-mirrors.txt; } > /tmp/apt-mirrors.txt
        sudo cp /tmp/apt-mirrors.txt /etc/apt/apt-mirrors.txt
    fi
done
echo "::error title=Playwright install::three attempts failed"
exit 1
