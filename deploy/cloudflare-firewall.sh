#!/bin/bash
set -euo pipefail
mode=${1:---check}
case "$mode" in --check|--apply) ;; *) echo 'Usage: cloudflare-firewall.sh --check|--apply' >&2; exit 2 ;; esac
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --silent --show-error --max-time 20 https://www.cloudflare.com/ips-v4 >"$work/4"
curl --fail --silent --show-error --max-time 20 https://www.cloudflare.com/ips-v6 >"$work/6"
python3 - "$work" <<'PY'
import ipaddress,pathlib,sys
for version in (4,6):
 lines=pathlib.Path(sys.argv[1],str(version)).read_text().splitlines()
 if len(lines)<5: raise SystemExit('Incomplete Cloudflare IP list; no firewall changes made.')
 for line in lines:
  network=ipaddress.ip_network(line,strict=True)
  if network.version!=version or network.prefixlen==0: raise SystemExit('Invalid Cloudflare range; no firewall changes made.')
 print(f'Validated {len(lines)} IPv{version} ranges.')
PY
if [ "$mode" = --check ]; then echo 'Validation only; no firewall rules changed. Review the interface and IPv6 routing before applying.'; exit 0; fi
[ "$(id -u)" = 0 ] || { echo 'Run --apply as root.' >&2; exit 1; }
interface=${PUBLIC_INTERFACE:-$(ip -o route show default | awk 'NR==1 {print $5}')}
[[ "$interface" =~ ^[a-zA-Z0-9_.:-]+$ ]] || { echo 'Set PUBLIC_INTERFACE to the public network interface.' >&2; exit 1; }
iptables -w -nL DOCKER-USER >/dev/null
ipv6=false
if ip -6 addr show dev "$interface" scope global | grep -q inet6; then
    ip6tables -w -nL DOCKER-USER >/dev/null || { echo 'Global IPv6 is active but Docker has no IPv6 DOCKER-USER chain. Configure IPv6 filtering before applying.' >&2; exit 1; }
    ipv6=true
fi
install -d -m 700 /var/lib/socket-help
iptables-save >/var/lib/socket-help/firewall-before.rules
if "$ipv6"; then ip6tables-save >/var/lib/socket-help/firewall-before-v6.rules; fi
for version in 4 6; do
    if [ "$version" = 6 ] && ! "$ipv6"; then continue; fi
    table=iptables; family=inet
    if [ "$version" = 6 ]; then table=ip6tables; family=inet6; fi
    live=socket_cf$version; next=socket_cf${version}_next
    ipset create "$live" hash:net family "$family" -exist
    ipset create "$next" hash:net family "$family" -exist
    ipset flush "$next"
    while IFS= read -r range; do ipset add "$next" "$range"; done <"$work/$version"
    ipset swap "$next" "$live"
    ipset destroy "$next"
    "$table" -w -nL SOCKET_CF >/dev/null 2>&1 || "$table" -w -N SOCKET_CF
    "$table" -w -C SOCKET_CF -m set --match-set "$live" src -j RETURN 2>/dev/null || "$table" -w -A SOCKET_CF -m set --match-set "$live" src -j RETURN
    "$table" -w -C SOCKET_CF -j DROP 2>/dev/null || "$table" -w -A SOCKET_CF -j DROP
    "$table" -w -C DOCKER-USER -i "$interface" -p tcp -m multiport --dports 80,443 -j SOCKET_CF 2>/dev/null || "$table" -w -I DOCKER-USER 1 -i "$interface" -p tcp -m multiport --dports 80,443 -j SOCKET_CF
    "$table" -w -C DOCKER-USER -i "$interface" -p udp --dport 443 -j SOCKET_CF 2>/dev/null || "$table" -w -I DOCKER-USER 1 -i "$interface" -p udp --dport 443 -j SOCKET_CF
 done
echo "Docker HTTP/HTTPS ingress on $interface now allows Cloudflare ranges only. SSH and other ports were not changed."
