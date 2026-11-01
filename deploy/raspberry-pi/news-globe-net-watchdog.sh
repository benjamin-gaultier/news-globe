#!/bin/bash
# Network watchdog for the ingest Pi: checks the network every minute and, when it
# stays down, restarts NetworkManager, then reboots. A Pi whose Wi-Fi drops can
# stay up but offline for days (it did from 2026-10-30 to 2026-11-01), and a
# plain reboot brings it back. The hardware watchdog (Raspberry Pi OS enables it)
# only covers a frozen system, not a lost network.
#
# Install: see docs/operations.md "Ingest on a Raspberry Pi", step 5. Runs as root
# from /usr/local/sbin, so a git pull never changes it: after editing, reinstall it
# and `systemctl restart news-globe-net-watchdog`.
#
# The variables below can be overridden from the environment, e.g. to test it.
set -u

CHECK_EVERY=${CHECK_EVERY:-60}       # seconds between checks
RESTART_AFTER=${RESTART_AFTER:-300}  # down this long: restart NetworkManager
REBOOT_AFTER=${REBOOT_AFTER:-900}    # still down this long: reboot
MIN_UPTIME=${MIN_UPTIME:-3600}       # never reboot sooner than this after boot, so a router
                                     # that is down for hours costs at most a reboot an hour
PUBLIC_HOST=${PUBLIC_HOST:-1.1.1.1}  # tried when the router doesn't answer

answers() {
  ping -q -c 3 -W 2 "$1" >/dev/null 2>&1
}

# Up when the router (the default route's gateway, over Ethernet or Wi-Fi) or
# PUBLIC_HOST answers a ping: some routers ignore pings to themselves, and a
# default route without a gateway (PPP, VPN) has no router to ping. No default
# route at all counts as down.
network_up() {
  local route gateway
  route=$(ip -4 route show default)
  [ -n "$route" ] || return 1
  gateway=$(awk '{ for (i = 1; i < NF; i++) if ($i == "via") { print $(i + 1); exit } }' <<<"$route")
  { [ -n "$gateway" ] && answers "$gateway"; } || answers "$PUBLIC_HOST"
}

# Seconds since boot. Unlike the wall clock, it never jumps (a Pi has no RTC, so
# its clock jumps forward when NTP syncs after boot).
uptime_s() {
  local up _
  read -r up _ </proc/uptime
  echo "${up%.*}"
}

down_since=''
restarted=0
while :; do
  now=$(uptime_s)
  if network_up; then
    if [ -n "$down_since" ]; then
      echo "network back after $((now - down_since)) s"
    fi
    down_since=''
    restarted=0
  else
    if [ -z "$down_since" ]; then
      down_since=$now
      echo "network down: neither the router nor $PUBLIC_HOST answers"
    fi
    down=$((now - down_since))
    if [ "$down" -ge "$REBOOT_AFTER" ] && [ "$now" -ge "$MIN_UPTIME" ]; then
      echo "network down for $down s: rebooting"
      systemctl reboot
    elif [ "$down" -ge "$RESTART_AFTER" ] && [ "$restarted" -eq 0 ]; then
      echo "network down for $down s: restarting NetworkManager"
      systemctl restart NetworkManager
      restarted=1
    fi
  fi
  sleep "$CHECK_EVERY"
done
