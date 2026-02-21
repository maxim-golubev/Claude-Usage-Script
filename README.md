Claude Usage Script
Tampermonkey userscript and OpenClaw skill for monitoring Claude.ai usage limits (session, weekly, and model-specific) with pace tracking.
Userscript — Claude Usage HUD
A lightweight HUD injected into the Claude.ai interface that displays your current usage across all rate-limit tiers.
Features
Dynamic bars — automatically detects all usage tiers from the API (session, weekly, Sonnet, Opus, OAuth, Cowork). New tiers appear without code changes.
Pace tracking — weekly bars show a tick mark indicating your ideal usage pace. Hover for details: whether you're over/under pace, your daily budget, and the max percentage to stay on track.
Responsive overflow — on chat pages, bars that don't fit the available header width collapse into a +N badge with a hover tooltip showing hidden stats.
Instant updates — intercepts completion streams and refreshes usage ~1 second after each message, plus a 60-second polling fallback.
SPA-aware — survives page navigation, React re-renders, sidebar toggles, and artifact panel resizing without flicker.
Two display modes — inline in the chat header, or fixed-position on the home screen with sidebar-aware positioning.
Screenshot
<!-- Add a screenshot here: ![HUD screenshot](screenshots/hud.png) -->
Installation
Install Tampermonkey (Chrome, Firefox, Edge, Safari)
Click the .user.js file in this repo, or create a new script and paste the contents of claude-usage-hud.user.js
Visit claude.ai — the HUD appears in the header
How it works
The script reads your lastActiveOrg cookie and polls /api/organizations/{orgId}/usage, which returns utilization percentages and reset times for each rate-limit tier. It renders SVG-based progress bars directly into the page DOM.
No data leaves your browser. No external requests. The script only talks to claude.ai using your existing session.
Configuration
The BAR_DEFS array at the top of the script controls bar labels and priority order:
const BAR_DEFS = [
    { key: 'five_hour',           label: 'Session',  priority: 1, windowDays: 0 },
    { key: 'seven_day',           label: 'Weekly',   priority: 2, windowDays: 7 },
    { key: 'seven_day_sonnet',    label: 'Sonnet',   priority: 3, windowDays: 7 },
    { key: 'seven_day_opus',      label: 'Opus',     priority: 4, windowDays: 7 },
    { key: 'seven_day_oauth_apps',label: 'OAuth',    priority: 5, windowDays: 7 },
    { key: 'seven_day_cowork',    label: 'Cowork',   priority: 6, windowDays: 7 },
];

Lower priority numbers are shown first and hidden last when space is limited.
OpenClaw Skill — Claude Usage Monitor
Coming soon. A custom skill for OpenClaw that lets you check usage from any messaging channel (Discord, Telegram, WhatsApp, etc.) and optionally sends proactive alerts on a cron schedule.
Note: This is a self-contained skill — no ClawHub dependency. You audit every line before installing it.
API Reference
The userscript and skill both consume the same undocumented endpoint:
GET /api/organizations/{orgId}/usage

Response shape:
{
  "five_hour":            { "utilization": 18, "resets_at": "2026-02-21T15:00:00Z" },
  "seven_day":            { "utilization": 55, "resets_at": "2026-02-24T04:00:00Z" },
  "seven_day_sonnet":     { "utilization": 0,  "resets_at": "2026-02-24T04:00:00Z" },
  "seven_day_opus":       null,
  "seven_day_oauth_apps": null,
  "seven_day_cowork":     null,
  "iguana_necktie":       null,
  "extra_usage":          null
}

utilization is an integer percentage (0–100).
resets_at is an ISO 8601 timestamp.
null entries mean the tier is not active for your account.
License
MIT
