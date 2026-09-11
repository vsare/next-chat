#!/bin/sh
set -eu

if [ -z "${PROXY_URL:-}" ]; then
  exec "$@"
fi

proxy_protocol=${PROXY_URL%%://*}
proxy_address=${PROXY_URL#*://}
proxy_host=${proxy_address%:*}
proxy_port=${proxy_address##*:}

case "$proxy_protocol" in
  http|socks4|socks5) ;;
  *)
    echo "Unsupported PROXY_URL protocol" >&2
    exit 1
    ;;
esac

case "$proxy_host" in
  ""|*[!A-Za-z0-9._-]*)
    echo "Invalid PROXY_URL host" >&2
    exit 1
    ;;
esac

case "$proxy_port" in
  ""|*[!0-9]*)
    echo "Invalid PROXY_URL port" >&2
    exit 1
    ;;
esac

proxy_config=/tmp/proxychains.conf
{
  printf '%s\n' "strict_chain"
  printf '%s\n' "proxy_dns"
  printf '%s\n' "remote_dns_subnet 224"
  printf '%s\n' "tcp_read_time_out 15000"
  printf '%s\n' "tcp_connect_time_out 8000"
  printf '%s\n' "localnet 127.0.0.0/255.0.0.0"
  printf '%s\n' "localnet ::1/128"
  printf '%s\n' "[ProxyList]"
  printf '%s %s %s\n' "$proxy_protocol" "$proxy_host" "$proxy_port"
} > "$proxy_config"

exec proxychains -q -f "$proxy_config" "$@"
