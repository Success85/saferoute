# 🛡️ SafeRoute LA — Crime Intelligence & Route Safety Platform

> Real-time Los Angeles route safety assessment powered by live LAPD open data (2020–2024)

---

## 🔴 Important — VPN Required

> **This application only works when your device's IP address resolves to the United States.**
>
> The LAPD Socrata API and Nominatim geocoding service restrict or rate-limit requests from non-US IP addresses. If you are accessing this from outside the USA (e.g. Rwanda, Nigeria, or anywhere in Africa/Europe), you **must connect to a VPN set to a US server** before using the app — both locally and via the hosted link.
>
> **Recommended:** ExpressVPN, NordVPN, or any free VPN with a US endpoint.
>
> **Coverage area:** Los Angeles, California only. Entering addresses outside LA city limits will return an error — the app only covers the LAPD jurisdiction.

---

## 🌐 Live Demo

| Environment | URL | Notes |
|---|---|---|
| **Primary (HTTPS)** | https://www2.simplesuccess.tech | Load balanced, SSL secured |
| **Load Balancer (IP)** | http://44.212.42.210 | HAProxy — routes to Web01 & Web02 |
| **Web01 (direct)** | http://44.211.47.49 | Nginx — Ubuntu 20.04 on AWS |
| **Web02 (direct)** | http://3.92.183.132 | Nginx — Ubuntu 20.04 on AWS |

**Demo Video:** https://drive.google.com/file/d/1trfcLVvFc8xu4a0B6QL0_WpXBUQU19lv/view?usp=sharing

---

## 📋 What It Does

SafeRoute LA is a crime intelligence web application that helps users make informed decisions about travel within Los Angeles. Enter an origin and destination — or tap the map twice — and the app:

- **Draws your driving route** on an interactive Leaflet.js map using real road data
- **Fetches up to 1,000 real LAPD crime incidents** from 2020–2024 within your route corridor
- **Scores each location 0–100** using a weighted algorithm (crime type × recency × distance decay)
- **Displays 3–5 destination incident cards** with full details: crime type, victim demographics, weapon used, address, LAPD division, date and time
- **Renders 8 analytics dashboard cards**: Origin Score, Route Score, Destination Score, Crime Type Breakdown, Victim Demographics, Recent Incidents, Weapons Used, LAPD Districts
- **Plots clickable crime dot markers** on the map — click any dot to see the full incident report in a popup
- **Recommends an alternative route** when the safety score falls below 65%
- **Provides personalised safety tips** based on the route's risk level
- **Exports incident data** as JSON, CSV, or PDF report

---

## 🔌 External APIs Used

| API | Purpose | Documentation |
|-----|---------|---------------|
| **LAPD Crime Data (Socrata SODA)** | Primary crime dataset — 1,000 incidents per analysis from 2020–2024 | [dev.socrata.com](https://dev.socrata.com/foundry/data.lacity.org/2nrs-mtv8) |
| **OpenRouteService (ORS)** | Driving route calculation — returns GeoJSON route geometry | [openrouteservice.org](https://openrouteservice.org/dev/#/api-docs) |
| **Nominatim (OpenStreetMap)** | Forward & reverse geocoding — converts addresses to GPS coordinates | [nominatim.org](https://nominatim.org/release-docs/develop/api/Search/) |
| **Leaflet.js** | Interactive map rendering with tile layers, markers, popups | [leafletjs.com](https://leafletjs.com/reference.html) |
| **CartoDB Tiles** | Light map tile layer (Voyager style) | [carto.com](https://carto.com/basemaps/) |

### API Keys & Security

```
LAPD Socrata App Token : twFAnZFlGFmESjd8vKBRLpPfEWslzbz34FJsggy3
Data.gov API Key       : twFAnZFlGFmESjd8vKBRLpPfEWslzbz34FJsggy3
OpenRouteService Key   : eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgi...
```

> The LAPD Socrata token is a **public rate-limit token** — it does not grant any write access and is safe to include in frontend code. In a production environment, all API keys would be moved to server-side environment variables and proxied through a backend. The ORS key is stored in `js/config.js`.

---

## 🚀 Running Locally

```bash
# Step 1 — Connect to a US VPN (required)

# Step 2 — Clone the repository
git clone https://github.com/Success85/saferoute.git
cd saferoute

# Step 3 — Start a local server (choose one)

# Option A — Python (no install needed)
python3 -m http.server 8080
# Open http://localhost:8080

# Option B — Node.js
npx serve .
# Open http://localhost:3000

# Option C — VS Code Live Server
# Right-click index.html → "Open with Live Server"
# Opens at http://127.0.0.1:5500
```

> ⚠️ **You must use a local server.** Opening `index.html` directly via `file://` will block Leaflet map tiles and all CORS API requests. The app will not function without a server.

---

## 🏗️ Server Infrastructure

This application is deployed across three AWS Ubuntu servers with a full load-balanced, HTTPS-secured architecture.

### Architecture Overview

```
                    ┌─────────────────────────────┐
                    │   VISITOR (with US VPN)      │
                    └──────────────┬──────────────┘
                                   │ HTTPS
                                   ▼
                    ┌─────────────────────────────┐
                    │         LB-01               │
                    │   HAProxy + Nginx            │
                    │   IP: 44.212.42.210          │
                    │   Domain: www2.simplesuccess │
                    │   SSL: Let's Encrypt         │
                    │   Port 443 → SSL termination │
                    │   Port 80  → HTTPS redirect  │
                    └──────────┬──────────────────┘
                               │ Round-robin HTTP
                    ┌──────────┴──────────────────┐
                    │                             │
          ┌─────────▼──────────┐    ┌────────────▼──────────┐
          │      WEB-01        │    │       WEB-02           │
          │  IP: 44.211.47.49  │    │  IP: 3.92.183.132      │
          │  Nginx on port 80  │    │  Nginx on port 80      │
          │  Ubuntu 20.04 AWS  │    │  Ubuntu 20.04 AWS      │
          │  /var/www/html/    │    │  /var/www/html/        │
          │    saferoute/      │    │    saferoute/          │
          └────────────────────┘    └────────────────────────┘
```

---

### LB-01 — Load Balancer (44.212.42.210)

**Role:** SSL termination, HTTPS redirect, round-robin load balancing

**Software:** HAProxy + Nginx on Ubuntu 20.04

**Domain:** `www2.simplesuccess.tech` → points to this IP

**SSL Certificate:** Let's Encrypt via Certbot (auto-renews every 90 days)

**HAProxy configuration** (`/etc/haproxy/haproxy.cfg`):

```haproxy
global
    log /dev/log local0
    maxconn 2048
    tune.ssl.default-dh-param 2048

defaults
    mode http
    timeout connect 5000
    timeout client  50000
    timeout server  50000

frontend www-http
    bind *:80
    acl is_challenge path_beg /.well-known/acme-challenge/
    use_backend certbot-backend if is_challenge
    http-request redirect scheme https code 301 if !is_challenge

frontend www-https
    bind *:443 ssl crt /etc/haproxy/certs/
    default_backend web-backend

backend web-backend
    balance roundrobin
    server web-01 44.211.47.49:80 check
    server web-02 3.92.183.132:80 check

backend certbot-backend
    server certbot 127.0.0.1:8080
```

**SSL auto-renewal** (`/etc/letsencrypt/renewal/www2.simplesuccess.tech.conf`):
```ini
pre_hook  = systemctl stop haproxy
post_hook = systemctl start haproxy
```

---

### WEB-01 — Web Server 1 (44.211.47.49)

**Role:** Serves static SafeRoute LA files via Nginx

**Software:** Nginx on Ubuntu 20.04 (AWS, aarch64)

**DNS:** `web-01.simplesuccess.tech` → 44.211.47.49

**Files location:** `/var/www/html/saferoute/`

**Nginx configuration** (`/etc/nginx/sites-enabled/tls-lb`):

```nginx
server {
    listen 80 default_server;
    server_name _;
    root /var/www/html/saferoute;
    index index.html;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### WEB-02 — Web Server 2 (3.92.183.132)

**Role:** Serves static SafeRoute LA files via Nginx (identical to Web01)

**Software:** Nginx on Ubuntu 20.04 (AWS, aarch64)

**DNS:** `web-02.simplesuccess.tech` → 3.92.183.132

**Files location:** `/var/www/html/saferoute/`

**Nginx configuration:** Identical to Web01 above.

---

### Deployment Process

To deploy updates to both servers after pushing to GitHub:

```bash
# Pull latest code on Web01
ssh ubuntu@44.211.47.49 "cd /var/www/html/saferoute && sudo git pull"

# Pull latest code on Web02
ssh ubuntu@3.92.183.132 "cd /var/www/html/saferoute && sudo git pull"
```

To do a full fresh deployment:

```bash
# Web01 — fresh clone
ssh ubuntu@44.211.47.49 "sudo rm -rf /var/www/html/saferoute && \
  sudo git clone https://github.com/Success85/saferoute.git /var/www/html/saferoute && \
  sudo chown -R www-data:www-data /var/www/html/saferoute && \
  sudo systemctl reload nginx"

# Web02 — fresh clone
ssh ubuntu@3.92.183.132 "sudo rm -rf /var/www/html/saferoute && \
  sudo git clone https://github.com/Success85/saferoute.git /var/www/html/saferoute && \
  sudo chown -R www-data:www-data /var/www/html/saferoute && \
  sudo systemctl reload nginx"
```

Verify both servers are serving the latest version:

```bash
curl -s https://www2.simplesuccess.tech/js/auth.js | head -3
curl -s http://44.211.47.49/js/auth.js | head -3
curl -s http://3.92.183.132/js/auth.js | head -3
```

---

## 📁 Project Structure

```
saferoute/
├── index.html              ← App shell, auth modal, map layout, panel tabs
├── css/
│   └── style.css           ← Complete design system — light mode only
├── js/
│   ├── config.js           ← API keys, LA bounds, crime classifiers, isRouteInLA()
│   ├── auth.js             ← Login, register, guest, session, security layer
│   ├── map.js              ← Leaflet init, tap-to-pick, ORS routing, crime markers
│   ├── api.js              ← LAPD SODA fetch, Nominatim geocoding, autocomplete
│   ├── score.js            ← Weighted scoring algorithm, verdict builder, tips
│   ├── render.js           ← All dashboard rendering + inline XSS protection
│   ├── cache.js            ← API response caching in sessionStorage (bonus)
│   ├── export.js           ← JSON / CSV / PDF export (bonus)
│   └── app.js              ← Main orchestrator: state, boot, analysis flow
├── Dockerfile              ← Docker container definition (bonus)
├── docker-compose.yml      ← Docker Compose setup (bonus)
├── nginx.conf              ← Nginx config with security headers (bonus)
├── .github/
│   └── workflows/
│       └── deploy.yml      ← CI/CD pipeline: lint → security scan → deploy (bonus)
└── README.md
```

---

## 🔒 Security Implementation (Bonus)

### XSS & HTML Injection Prevention
All user-provided values and API data inserted into the DOM are passed through `xss()` — a 7-character HTML escape function in `render.js` that encodes `&`, `<`, `>`, `"`, `'`, `/`, and `` ` ``. This prevents script injection, HTML tag injection, attribute injection, and template literal injection.

### Script & SQL Injection Detection
`auth.js` contains inline pattern arrays:
- `_SCRIPT_PAT` — 12 regex patterns detecting `<script>`, `javascript:`, `vbscript:`, `data:text/html`, `on*=` event handlers, `<iframe>`, `expression()`, `{{template}}`, `${template}`, `<% %>` server templates, and HTML entity encoding bypasses
- `_SQL_PAT` — 10 regex patterns detecting `UNION SELECT`, `DROP TABLE`, `INSERT INTO`, `OR 1=1`, SQL comment sequences `--` and `/*`, `EXEC()`, `XP_` stored procedures, `CAST()` and `CONVERT()` injection

### Prototype Pollution Prevention
`_safeJSON()` in `auth.js` parses all localStorage data and removes `__proto__`, `constructor`, `prototype`, `__defineGetter__`, and `__lookupGetter__` keys before any object is used.

### Brute Force Rate Limiting
`_limit()` in `auth.js` implements in-memory bucket counting:
- Login: max **5 attempts per 2 minutes** — shows countdown timer on block
- Register: max **3 attempts per 10 minutes**

### Location Input Security
`_locBad()` and `_locClean()` in `app.js` detect and sanitize address inputs before geocoding — blocking HTML tags, `javascript:`, event handlers, SQL keywords, path traversal (`../`), template injection, HTML entity encoding, and null bytes. Each attack type returns a specific, human-readable error message.

### Real-time Paste Protection
All auth form fields and location inputs monitor `paste` events — pasted content containing injection patterns is blocked immediately with a toast notification.

### Nginx Security Headers (on both web servers)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

---

## ⚙️ Safety Scoring Algorithm

```
Score = max(0, min(100, 100 − Σ deductions))
```

For each crime within the search radius:
```
deduction = type_weight × recency_multiplier × distance_decay
```

**Crime type weights:**

| Crime Type | Weight |
|---|---|
| Violent, Part 1 (homicide, rape, robbery, assault) | 14 |
| Violent, Part 2 | 10 |
| Property crime (theft, burglary, vandalism) | 4.5 |
| Other | 1.5 |

**Recency multipliers** (relative to the newest date in the fetched batch — not `Date.now()`):

| Age of crime | Multiplier |
|---|---|
| ≤ 30 days | ×2.0 |
| ≤ 90 days | ×1.5 |
| ≤ 180 days | ×1.2 |
| ≤ 365 days | ×1.0 |
| Older | ×0.5 |

**Distance decay** (from the scored location centre):

| Distance | Decay |
|---|---|
| < 100 m | ×1.0 |
| < 200 m | ×0.9 |
| < 400 m | ×0.75 |
| < 600 m | ×0.6 |
| Beyond radius | Excluded |

**Score bands:**

| Score | Risk Level | Meaning |
|---|---|---|
| 75–100 | 🟢 SAFE | Proceed with standard precautions |
| 55–74 | 🟡 MODERATE | Stay alert, especially after dark |
| 35–54 | 🟠 CAUTION | Consider alternate routes |
| 0–34 | 🔴 HIGH RISK | Strongly consider alternatives |

---

## ✅ Full Feature List

### Core Functionality
- ✅ Enter origin and destination via text — autocomplete powered by Nominatim (LA-bounded)
- ✅ Tap map twice to set origin and destination with confirmation popup
- ✅ GPS location button sets origin to current device position
- ✅ Driving route drawn on map via OpenRouteService (ORS) with glow effect
- ✅ Alternative route drawn when safety score ≤ 65% — different colour with score label
- ✅ Up to 1,000 LAPD incidents fetched per analysis from 2020–2024
- ✅ Crime dot markers: red = violent, orange = property, purple = other
- ✅ Marker size and opacity scaled by recency — newer crimes are larger and more opaque
- ✅ Full incident popup on each marker: type, date, time, victim, address, weapon, division
- ✅ Radius slider (0.5–5km) to control search corridor size
- ✅ Toggle markers on/off, recenter map, clear all

### Dashboard
- ✅ Origin safety score — animated arc gauge with risk badge
- ✅ Destination safety score — animated arc gauge with risk badge
- ✅ Route score card with animated fill bar and stats (distance, time, incidents, period)
- ✅ Verdict card — contextual safety message with emoji
- ✅ 3–5 closest destination incidents with full case details
- ✅ Crime type breakdown bar chart
- ✅ Victim demographics — gender and age group bars
- ✅ Weapons used chart
- ✅ LAPD district activity chart
- ✅ Personalised safety tips (3–6 tips based on risk level)

### Incidents Panel
- ✅ Filter by crime type (violent / property / other)
- ✅ Filter by year (2020–2024)
- ✅ Search by keyword with injection protection
- ✅ Export incidents as **JSON**, **CSV**, or **PDF report**

### Authentication
- ✅ Register with first name, last name, email, password
- ✅ Full field validation with inline error messages
- ✅ Password strength meter (Very Weak → Strong)
- ✅ Show/hide password toggle
- ✅ Login with session persistence across page reloads
- ✅ Guest access mode
- ✅ Secure logout

### Error Handling
- ✅ Missing origin / destination — modal with instructions
- ✅ Invalid / injection input in address fields — specific modal naming the attack type
- ✅ Address not found in LA — modal with example addresses
- ✅ Location outside Los Angeles bounds — modal clearing the invalid input
- ✅ Same origin and destination — modal
- ✅ ORS routing failure — fallback to straight-line with toast warning
- ✅ LAPD API error — modal with error details
- ✅ Zero crimes outside coverage area — modal explaining the result is not meaningful
- ✅ Rate limit exceeded on login/register — countdown timer in error message
- ✅ Injection detected in search — inline error with field cleared

### Bonus Features
- ✅ **User authentication** — register, login, session persistence, guest mode
- ✅ **Advanced data visualisation** — arc gauges, animated bars, demographics
- ✅ **API response caching** — `cache.js` caches LAPD responses in `sessionStorage` for 10 minutes, keyed by route hash — instant re-analysis on same route
- ✅ **Docker containerisation** — `Dockerfile` + `docker-compose.yml` + `nginx.conf` with security headers
- ✅ **CI/CD pipeline** — `.github/workflows/deploy.yml` — lint → security scan → Docker build → SSH deploy to Web01 and Web02
- ✅ **Data export** — JSON (structured), CSV (spreadsheet), PDF (formatted print report)
- ✅ **Comprehensive security** — XSS, HTML injection, script injection, SQL injection, prototype pollution, brute force protection, rate limiting, paste blocking

---

## 🐳 Docker (Bonus)

```bash
# Build and run in Docker
docker-compose up -d --build

# Access at http://localhost
# View logs
docker-compose logs -f
# Stop
docker-compose down
```

The Docker container uses Nginx Alpine (~7MB) and includes a health check endpoint at `/health`.

---

## ⚙️ CI/CD Pipeline (Bonus)

The GitHub Actions pipeline at `.github/workflows/deploy.yml` runs automatically on every push to `main`:

| Job | What it does |
|---|---|
| **Lint & Validate** | HTML validation, JS syntax check, scan for unprotected `innerHTML` |
| **Security Scan** | Check for `eval()`, unprotected innerHTML, console.log in production |
| **Build Docker Image** | Build container, run health check test |
| **Deploy to Web01 & Web02** | SSH into both servers, `git pull`, reload Nginx |

Required GitHub repository secrets: `WEB01_HOST`, `WEB02_HOST`, `WEB01_USER`, `WEB02_USER`, `SSH_PRIVATE_KEY`

---

## 🧩 Challenges & Solutions

**1. Socrata `$` parameter encoding**
`URLSearchParams` encodes `$` as `%24`, which Socrata silently ignores — returning unfiltered data. Fix: build the URL as a plain string so `$where`, `$limit`, `$order` stay literal. Only values are URL-encoded.

**2. Dataset dates vs current date**
Using `Date.now()` as the recency reference made all 2020–2024 records appear 400–2200 days old, causing deductions to collapse to near-zero and every area to score SAFE. Fix: `computeRefDate()` finds the newest crime date in the fetched batch and uses that as the reference point for all age calculations.

**3. SVG `className` read-only crash**
SVG `<path>` elements expose `.className` as a read-only `SVGAnimatedString`. Direct assignment threw a `TypeError` that aborted the entire dashboard render. Fix: use `arc.setAttribute('class', ...)` instead of `arc.className =`.

**4. Alternative route labels not clearing**
Alt route labels were anonymous Leaflet markers added to the map but never stored in state — `clearAltRoutes()` had no reference to remove them. Fix: store all four objects (2 layers + 2 labels) in the `MAP` state object.

**5. Out-of-LA locations scoring 100%**
Locations outside LA return zero LAPD records. `scoreLocation([])` has nothing to deduct so returns 100% SAFE — misleading. Fix: LA bounds check before analysis + keyword-based label check after zero results. Both paths show a specific error modal and clear the invalid input.

**6. HAProxy intercepting Certbot challenges**
During SSL certificate issuance, Certbot's HTTP-01 challenge was being proxied by HAProxy to the web servers instead of being served locally. Fix: added an ACL in HAProxy to route `/.well-known/acme-challenge/` to a local backend, with `pre_hook` and `post_hook` in the Certbot renewal config to stop/start HAProxy during renewal.

---

## 📊 Rubric Alignment

| Criterion | Implementation |
|---|---|
| **Purpose & Value (10pts)** | Real crime intelligence tool for LA residents and visitors — practical, data-driven route safety with actionable scores and tips |
| **API Usage (15pts)** | 4 APIs integrated: LAPD (primary data), ORS (routing), Nominatim (geocoding), Leaflet (mapping). Token stored in config, not hardcoded in fetch calls. Data fetched, processed, scored, and visualised meaningfully |
| **Error Handling (10pts)** | 12+ distinct error cases each with a specific modal — injection attacks, out-of-LA, routing failures, API errors, missing input, zero coverage, rate limits |
| **User Interaction (15pts)** | Tap map, type with autocomplete, GPS, radius slider, 4 dashboard tabs, filter/search incidents, export data, auth flow, alternative route, crime marker popups |

---

## 🗃️ Attribution

- **LAPD Crime Data** — City of Los Angeles via [LA Open Data](https://data.lacity.org) — Public Domain
- **Map tiles** — © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · © [CARTO](https://carto.com/basemaps/) (Voyager)
- **Routing** — [OpenRouteService](https://openrouteservice.org/) — CC BY 4.0
- **Geocoding** — [Nominatim / OpenStreetMap Foundation](https://nominatim.org/)
- **Leaflet.js** — [Vladimir Agafonkin](https://leafletjs.com/) — BSD 2-Clause
- **Font Awesome** — [Fonticons Inc.](https://fontawesome.com/) — CC BY 4.0
- **Fonts** — Bebas Neue, Outfit, JetBrains Mono — Google Fonts, SIL OFL

---

*SafeRoute LA — Built for the Playing Around with APIs assignment · African Leadership University*
