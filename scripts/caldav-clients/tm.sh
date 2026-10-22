#!/bin/bash
# tm.sh init|discover|sync|todo ARGS: todoman and vdirsyncer with configs in $WORK/tm.
set -euo pipefail
D=${WORK:?}/tm
export TODOMAN_CONFIG=$D/config.py
export VDIRSYNCER_CONFIG=$D/vdirsyncer.conf
export TZ=Europe/Berlin
cmd=$1; shift
case $cmd in
  todo) exec todo "$@" ;;
  sync) exec vdirsyncer sync "$@" ;;
  discover) (set +o pipefail; yes | vdirsyncer discover "$@") ;;
  init)
    rm -rf "$D"; mkdir -p "$D/vdir" "$D/status"
    S=$(python3 -c "import json;print(json.load(open('$WORK/apppw.json'))['secret'])")
    cat > "$D/config.py" <<EOF
path = "$D/vdir/*"
date_format = "%Y-%m-%d"
time_format = "%H:%M"
default_list = "inbox"
humanize = False
default_due = 0
EOF
    cat > "$D/vdirsyncer.conf" <<EOF
[general]
status_path = "$D/status/"

[pair opentodo]
a = "local"
b = "remote"
collections = ["from b"]

[storage local]
type = "filesystem"
path = "$D/vdir/"
fileext = ".ics"

[storage remote]
type = "caldav"
url = "http://127.0.0.1:18081/dav/"
username = "t@example.com"
password = "$S"
item_types = ["VTODO"]
EOF
    ;;
esac
