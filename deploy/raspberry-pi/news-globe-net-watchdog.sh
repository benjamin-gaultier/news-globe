#!/bin/bash
# Network watchdog for the ingest Pi: pings the router every minute and, when it
# stays unreachable, restarts NetworkManager, then reboots. A Pi whose Wi-Fi drops
# can stay up but offline for days (it did from 2026-10-30 to 2026-11-01), and a
# plain reboot brings it back. The hardware watchdog (Raspberry Pi OS enables it)
# only covers a frozen system, not a lost network.
#
# Install: see docs/operations.md "Ingest on a Raspberry Pi", step 5. Runs as root
# from /usr/local/sbin, so a git pull never changes it: reinstall after editing.
#
# The variables below can be overridden from the environment, e.g. to test it.
set -u

CHECK_EVERY=${CHECK_EVERY:-60}       # seconds between checks
RESTART_AFTER=${RESTART_AFTER:-300}  # router unreachable this long: restart NetworkManager
REBOOT_AFTER=${REBOOT_AFTER:-900}    # still unreachable this long: reboot
MIN_UPTIME=${MIN_UPTIME:-3600}       # never reboot sooner than this after boot, so a router
                                     # that is down for hours costs at most a reboot an hour

# The router is the default route's gateway, whichever interface (Ethernet or
# Wi-Fi) carries it. No default route at all counts as unreachable.
router_reachable() {
  local gateway
  gateway=$(ip -4 route show default | awk '{ print $3; exit }')
  [ -n "$gateway" ] && ping -q -c 3 -W 2 "$gateway" >/dev/null 2>&1
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
  if router_reachable; then
    if [ -n "$down_since" ]; then
      echo "router reachable again after $((now - down_since)) s"
    fi
    down_since=''
    restarted=0
  else
    if [ -z "$down_since" ]; then
      down_since=$now
      echo "router unreachable"
    fi
    down=$((now - down_since))
    if [ "$down" -ge "$REBOOT_AFTER" ] && [ "$now" -ge "$MIN_UPTIME" ]; then
      echo "router unreachable for $down s: rebooting"
      systemctl reboot
    elif [ "$down" -ge "$RESTART_AFTER" ] && [ "$restarted" -eq 0 ]; then
      echo "router unreachable for $down s: restarting NetworkManager"
      systemctl restart NetworkManager
      restarted=1
    fi
  fi
  sleep "$CHECK_EVERY"
done
