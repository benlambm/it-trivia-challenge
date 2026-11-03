# Server-side pieces (installed by hand)

The GitHub deploy only resets `/opt/trivia-app` and rebuilds; it never touches
these. Install or update them as root on the VPS. Back up what you replace.

| File | Installs to | Purpose |
|------|-------------|---------|
| `systemd/trivia-api.service.d/20-state.conf` | `/etc/systemd/system/trivia-api.service.d/` | Writable `/var/lib/trivia-api` for `events.jsonl` (the service runs with `ProtectSystem=strict`) |
| `nginx/trivia-stats-location.conf` | inside the 443 `server` block of `/etc/nginx/sites-available/trivia.benlamb.net` | Serves the app for `/stats` |
| `trivia-monthly-report` | `/usr/local/sbin/` (0755 root) | Builds and emails the monthly report with CSV + raw events attached; keeps dated copies in `/var/backups/trivia-stats/` |
| `systemd/trivia-monthly-report.{service,timer}` | `/etc/systemd/system/` | Runs the report at 13:00 UTC on the 1st; failures mail root via `notify-failure@` |

```bash
sudo install -D -m 0644 ops/systemd/trivia-api.service.d/20-state.conf /etc/systemd/system/trivia-api.service.d/20-state.conf
sudo install -m 0755 ops/trivia-monthly-report /usr/local/sbin/trivia-monthly-report
sudo install -m 0644 ops/systemd/trivia-monthly-report.service ops/systemd/trivia-monthly-report.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now trivia-monthly-report.timer
# nginx: paste the location, then
sudo nginx -t && sudo systemctl reload nginx
```

Test the report without sending: `sudo DRY_RUN=1 TRIVIA_REPORT_MONTH=current /usr/local/sbin/trivia-monthly-report`.
Send one now: `sudo TRIVIA_REPORT_MONTH=current /usr/local/sbin/trivia-monthly-report`, then
`journalctl -t msmtp -n 3` should show `smtpstatus=250`.

Data: `/var/lib/trivia-api/events.jsonl` is the only copy of live tracking
between monthly reports. The API loads it once at start and appends while
running; to edit it (rare), stop `trivia-api`, back it up, edit, start.
