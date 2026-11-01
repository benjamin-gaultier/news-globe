#!/bin/bash
# Tests news-globe-net-watchdog.sh's decisions without a network or waiting: ping,
# ip, systemctl and sleep are stubs, and the sleep stub advances a fake uptime, so
# hours of watchdog time take a second. CI runs it: bash deploy/raspberry-pi/test-net-watchdog.sh
set -u
# The expectations below assume the watchdog's defaults, whatever the caller exported.
unset CHECK_EVERY RESTART_AFTER REBOOT_AFTER MIN_UPTIME PUBLIC_HOST

watchdog=$(dirname "$0")/news-globe-net-watchdog.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export T
mkdir "$T/bin"

# Answers unless the fake time falls in one of the "from to" lines of
# $T/router.down (any target but 1.1.1.1) or $T/public.down (1.1.1.1).
cat >"$T/bin/ping" <<'EOF'
#!/bin/bash
target=${!#}
read -r now _ <"$T/uptime"
echo "$target" >>"$T/pings"
f=$T/router.down; [ "$target" = 1.1.1.1 ] && f=$T/public.down
! awk -v t="${now%.*}" '$1 <= t && t < $2 { down = 1 } END { exit !down }' "$f"
EOF
cat >"$T/bin/ip" <<'EOF'
#!/bin/bash
cat "$T/route"
EOF
cat >"$T/bin/systemctl" <<'EOF'
#!/bin/bash
read -r now _ <"$T/uptime"
echo "${now%.*} $*" >>"$T/calls"
EOF
# Moves the clock on; once it reaches $T/end, stops the watchdog.
cat >"$T/bin/sleep" <<'EOF'
#!/bin/bash
read -r now _ <"$T/uptime"
now=$((${now%.*} + $1))
echo "$now.00 0.00" >"$T/uptime"
[ "$now" -lt "$(cat "$T/end")" ] || kill "$PPID"
EOF
chmod +x "$T"/bin/*

failures=0

# expect NAME START END ROUTE ROUTER_DOWN PUBLIC_DOWN CALLS PINGED
# Runs the watchdog with its real timings from uptime START until END. ROUTE is
# what `ip route show default` prints; *_DOWN are comma-separated "from to"
# outages; CALLS is the comma-separated "uptime command" list of systemctl calls
# expected, and PINGED the sorted, space-separated set of addresses pinged.
expect() {
  local name=$1 calls pinged
  echo "$2.00 0.00" >"$T/uptime"
  echo "$3" >"$T/end"
  echo "$4" >"$T/route"
  tr , '\n' <<<"$5" >"$T/router.down"
  tr , '\n' <<<"$6" >"$T/public.down"
  : >"$T/calls"
  : >"$T/pings"
  # The subshell's stderr swallows bash's "Terminated" when the sleep stub stops it
  # (the `:` keeps bash from exec-ing timeout in place of the subshell).
  (PATH="$T/bin:$PATH" UPTIME_FILE="$T/uptime" timeout 30 bash "$watchdog" >"$T/out" 2>&1; :) 2>/dev/null
  calls=$(paste -sd, "$T/calls")
  pinged=$(sort -u "$T/pings" | paste -sd ' ')
  if [ "$calls" = "$7" ] && [ "$pinged" = "$8" ]; then
    echo "ok: $name"
  else
    failures=$((failures + 1))
    echo "FAIL: $name"
    echo "  systemctl: '$calls', expected '$7'"
    echo "  pinged:    '$pinged', expected '$8'"
    sed 's/^/  log: /' "$T/out"
  fi
}

gw="default via 192.168.1.254 dev eth0 proto dhcp metric 100"

expect "outage: restart NetworkManager after 5 min, reboot after 15, retry each minute" \
  4000 5100 "$gw" "4100 99999" "4100 99999" \
  "4420 restart NetworkManager,5020 reboot,5080 reboot" "1.1.1.1 192.168.1.254"
expect "router ignores ping, 1.1.1.1 answers: nothing" \
  4000 6000 "$gw" "0 99999" "" \
  "" "1.1.1.1 192.168.1.254"
expect "outage right after boot: no reboot before MIN_UPTIME" \
  60 3700 "$gw" "0 99999" "0 99999" \
  "360 restart NetworkManager,3600 reboot,3660 reboot" "1.1.1.1 192.168.1.254"
expect "recovery resets: a second outage restarts NetworkManager again" \
  4000 5500 "$gw" "4000 4400,5000 5400" "4000 4400,5000 5400" \
  "4300 restart NetworkManager,5320 restart NetworkManager" "1.1.1.1 192.168.1.254"
expect "no default route: down, nothing pinged" \
  4000 4400 "" "" "" \
  "4300 restart NetworkManager" ""
expect "default route without a gateway, 1.1.1.1 answers: nothing" \
  4000 6000 "default dev ppp0 scope link" "" "" \
  "" "1.1.1.1"
expect "default route without a gateway, 1.1.1.1 down: restart" \
  4000 4400 "default dev ppp0 scope link" "" "0 99999" \
  "4300 restart NetworkManager" "1.1.1.1"

[ "$failures" -eq 0 ] || { echo "$failures failed"; exit 1; }
