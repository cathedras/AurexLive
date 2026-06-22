# Windows Internal DNS + step-ca + PM2

This guide fits the current app layout when the site is used only inside a LAN and runs on a Windows server.

## Deployment Model

Use three pieces together:

1. CoreDNS answers the internal hostname.
2. step-ca issues the HTTPS certificate for that hostname.
3. PM2 keeps the Node process running and reloads it after renewal.

The app already supports HTTPS directly through `USE_HTTPS=1`, `SSL_KEY_PATH`, and `SSL_CERT_PATH`.
When `STEP_CA_RENEW_ON_START` is enabled, the backend performs a one-time `step ca renew` during startup, so you do not need a scheduled renewal job.
CoreDNS is handled as a separate PM2 service in production so its logs can be viewed with `pm2 logs dns-service`.
The homepage also reads `/v1/dns/status` so it can display the currently usable DNS address instead of relying on logs alone.

## DNS

Create an internal name fixed as `www.auxm.com` and point it to the server LAN IP. The DNS service will keep checking for network readiness after startup; until the machine gets a usable DHCP IPv4 address and can reach the DNS forwarder, the site stays localhost-only.

Default CoreDNS template:

```coredns
:53 {
    errors
    log
    cache 30
    forward . __FORWARDERS__
}

www.auxm.com:53 {
    hosts {
        __LAN_IP__ www.auxm.com
        fallthrough
    }
    errors
    log
}
```

If you only need one hostname, keep just the `www.auxm.com` record. The actual runtime CoreDNS file is generated at startup from the template and the machine's current DHCP IP, so you do not hand-edit the address.

## step-ca

Use step-ca to issue a leaf certificate for the same hostname that DNS resolves.

If you want the backend to run the renewal check automatically on startup, keep `STEP_CA_RENEW_ON_START` enabled or leave it unset. Set it to `0` only if you want to disable the startup hook.

If step-cli is not already bootstrapped on the machine, set `STEP_CLI_PATH` and optionally `STEP_CA_URL` / `STEP_CA_ROOT_PATH` so the startup renewal hook can reach the CA.

Recommended certificate contract:

1. Root CA stays offline.
2. Intermediate CA can stay online for day-to-day issuance.
3. The leaf certificate SAN must include `www.auxm.com`.

After the certificate files are renewed, place them under a stable path and point the app at them through the environment:

```bash
USE_HTTPS=1
SSL_KEY_PATH=C:/aurexlive/certs/www.auxm.com.key
SSL_CERT_PATH=C:/aurexlive/certs/www.auxm.com.crt
PUBLIC_BASE_URL=https://www.auxm.com
MOBILE_BASE_URL=https://www.auxm.com
COREDNS_PATH=C:/tools/coredns/coredns.exe
COREDNS_DOMAIN=www.auxm.com
# COREDNS_TARGET_IP can be omitted to use the current DHCP address automatically.
# The DNS service keeps checking network readiness in the background until it can safely start CoreDNS.
```

## PM2

Use the existing PM2 ecosystem:

```bash
npm run deploy:win
```

That script installs dependencies, builds the frontend, and starts or reloads PM2.

If you want DNS as a separate PM2 process, start it with:

```bash
npm run pm2:dns:start
```

During process startup, the backend will try to renew the TLS certificate once and then continue booting. If renewal is not needed, startup proceeds normally.

After a certificate is renewed manually or by a later restart, reload the app:

```bash
npm run pm2:restart
```

To inspect DNS logs:

```bash
npm run pm2:dns:logs
```

If you want to disable the startup renewal hook, set `STEP_CA_RENEW_ON_START=0`.

## Validation

Check these three things after deployment:

1. The hostname `www.auxm.com` resolves to the current LAN IP through CoreDNS once network readiness is confirmed.
2. The certificate SAN contains `www.auxm.com`.
3. The app logs show the internal HTTPS origin instead of `localhost`.

The startup log and OpenAPI docs will now use `PUBLIC_BASE_URL` when it is set.