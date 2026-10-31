#!/bin/bash
set -euo pipefail
umask 077
trusted=${APP_MAIL_ADDRESS:?Set the app container address}
[[ "$trusted" =~ ^10\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
keys=/etc/opendkim/keys
mkdir -p "$keys"
if [ ! -s "$keys/socketspace.xyz.private" ]; then
    opendkim-genkey -b 2048 -s socket -d socketspace.xyz -D "$keys"
    mv "$keys/socket.private" "$keys/socketspace.xyz.private"
    mv "$keys/socket.txt" "$keys/socketspace.xyz.txt"
fi
chown -R opendkim:opendkim "$keys"
printf '%s\n' '127.0.0.1' "$trusted" > /etc/opendkim/trusted-hosts
cat > /etc/opendkim/opendkim.conf <<CONF
Syslog yes
Mode s
Canonicalization relaxed/relaxed
UserID opendkim:opendkim
Socket inet:8891@127.0.0.1
Domain socketspace.xyz
Selector socket
KeyFile $keys/socketspace.xyz.private
InternalHosts /etc/opendkim/trusted-hosts
OversignHeaders From
CONF
chown opendkim:opendkim /etc/opendkim/opendkim.conf /etc/opendkim/trusted-hosts
postconf -e \
    'myhostname=mail.socketspace.xyz' 'mydestination=' 'relayhost=' \
    'inet_interfaces=all' 'inet_protocols=ipv4' \
    "mynetworks=127.0.0.0/8,$trusted/32" \
    'smtpd_client_restrictions=permit_mynetworks,reject' \
    'smtpd_relay_restrictions=permit_mynetworks,reject' \
    'smtpd_sender_restrictions=check_sender_access regexp:/etc/postfix/allowed-senders,reject' \
    'smtpd_sasl_auth_enable=no' 'smtpd_tls_security_level=none' \
    'smtpd_milters=inet:127.0.0.1:8891' 'non_smtpd_milters=inet:127.0.0.1:8891' \
    'milter_default_action=tempfail' 'milter_protocol=6' \
    'smtp_tls_security_level=may' 'smtp_tls_CAfile=/etc/ssl/cert.pem' \
    'message_size_limit=1572864' 'maximal_queue_lifetime=1d' 'bounce_queue_lifetime=1d' \
    'maillog_file=/dev/stdout'
printf '%s\n' '/@socketspace\.xyz$/ OK' > /etc/postfix/allowed-senders
chmod 644 /etc/postfix/allowed-senders
postconf -M 'submission/inet=submission inet n - n - - smtpd'
mkdir -p /usr/share/doc/postfix/readme /usr/share/doc/postfix/html
postfix set-permissions
exec /usr/bin/supervisord -n -c /etc/supervisord.conf
