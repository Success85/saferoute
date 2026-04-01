# 🛡️ SafeNav LA — Crime Intelligence & Route Safety

**Real-time Los Angeles route safety assessment powered by LAPD open data (2020–2024)**

---

## Live Demo

```
http://[lb01-ip]/          ← Load Balancer (primary)
http://[web01-ip]/safenav/ ← Web01 direct
http://[web02-ip]/safenav/ ← Web02 direct
```

---

## What It Does

SafeNav LA lets you enter an origin and destination (or tap the map twice) to instantly:

- **Draw the driving route** on an interactive Leaflet map
- **Fetch real LAPD crime incidents** from 2020–2024 within the corridor
- **Score each location 0–100** using a weighted algorithm (crime type × recency × distance)
- **Show the 3–5 closest incidents** to your destination with full details: victim, weapon, address, crime type
- **Display 8 analytics cards**: Origin Score, Route Score, Destination Score, Crime Breakdown, Demographics, Incidents, Weapons, LAPD Districts
- **Plot clickable crime markers** on the map — click any dot to see the full incident report
- **Recommend safety tips** based on the route's risk level

---

## External APIs Used

| API | Purpose | Docs |
|-----|---------|------|
| **LAPD Crime Data (Socrata SODA)** | Primary crime dataset 2020–2024 | https://dev.socrata.com/foundry/data.lacity.org/2nrs-mtv8 |
| **Nominatim (OpenStreetMap)** | Forward & reverse geocoding — converts text addresses to GPS | https://nominatim.org/release-docs/develop/api/Search/ |
| **OSRM (Project OSRM)** | Free driving route calculation | http://project-osrm.org/ |
| **Leaflet.js** | Interactive map rendering | https://leafletjs.com/reference.html |
| **CartoDB Basemaps** | Dark/light map tiles (free, no key) | https://carto.com/basemaps |

### API Key
```
LAPD App Token: twFAnZFlGFmESjd8vKBRLpPfEWslzbz34FJsggy3
```
*(Stored in `js/api.js` — for production, move to environment variable)*

---

## Running Locally

```bash
# Option 1 — Python (no install needed)
cd safenav/
python3 -m http.server 8080
# Open http://localhost:8080

# Option 2 — Node.js
npx serve .
# Open http://localhost:3000

# Option 3 — VS Code Live Server
# Right-click index.html → Open with Live Server
```

> ⚠️ **Must use a local server** — `file://` URLs block the Leaflet map and CORS requests.

---

## Deployment on Web Servers (Part Two)

### Prerequisites on Web01 and Web02

```bash
# Ensure Nginx is installed
sudo apt update && sudo apt install -y nginx
```

### Deploy Application Files

```bash
# On your local machine — copy files to both servers
scp -r safenav/ ubuntu@[web01-ip]:/var/www/html/
scp -r safenav/ ubuntu@[web02-ip]:/var/www/html/

# OR clone from GitHub on each server
sudo git clone https://github.com/[your-user]/safenav-la.git /var/www/html/safenav
```

### Nginx Configuration — Web01 and Web02

Create `/etc/nginx/sites-available/safenav`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    root /var/www/html/safenav;
    index index.html;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(css|js|png|jpg|svg|woff2|ico)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript text/html;
    gzip_min_length 1000;

    error_page 404 /index.html;

    access_log /var/log/nginx/safenav_access.log;
    error_log  /var/log/nginx/safenav_error.log;
}
```

```bash
# Enable and restart on both servers
sudo ln -s /etc/nginx/sites-available/safenav /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

### Load Balancer Configuration — Lb01

On the load balancer server, create `/etc/nginx/sites-available/lb-safenav`:

```nginx
upstream safenav_backend {
    # Round-robin load balancing (default)
    server [web01-ip]:80;
    server [web02-ip]:80;

    # Health check — mark server down after 3 failures in 30s
    keepalive 16;
}

server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass         http://safenav_backend;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;

        # Buffer settings
        proxy_buffer_size         4k;
        proxy_buffers             8 4k;
        proxy_busy_buffers_size   8k;
    }

    # Health endpoint
    location /health {
        return 200 "SafeNav LB OK\n";
        add_header Content-Type text/plain;
    }

    access_log /var/log/nginx/lb_access.log;
    error_log  /var/log/nginx/lb_error.log;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lb-safenav /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Verify Load Balancer

```bash
# Hit the LB repeatedly — watch which server responds
for i in {1..6}; do curl -s http://[lb01-ip]/ | grep -o "SafeNav LA" && echo "Request $i OK"; done

# Check Nginx status
sudo systemctl status nginx
sudo tail -f /var/log/nginx/lb_access.log
```

---

## Project Structure

```
safenav/
├── index.html          ← App shell + auth modal + HTML layout
├── css/
│   └── main.css        ← Complete design system (dark/light themes)
├── js/
│   ├── auth.js         ← Login, signup, guest, session management
│   ├── map.js          ← Leaflet init, tap-to-set, route drawing, markers
│   ├── api.js          ← LAPD fetch, Nominatim geocoding, autocomplete
│   ├── score.js        ← Safety scoring algorithm, verdict builder
│   ├── render.js       ← All dashboard rendering functions
│   └── app.js          ← Main orchestrator: state, flow, tabs, boot
└── README.md
```

---

## Safety Scoring Algorithm

```
Score = max(0, min(100, 100 − Σ deductions))
```

For each crime within the radius:
```
deduction = type_weight × recency_multiplier × distance_decay
```

| Crime Type | Weight |
|-----------|--------|
| Violent, Part 1 (homicide, rape, robbery) | 14 |
| Violent, Part 2 | 10 |
| Property crime | 4.5 |
| Other | 1.5 |

| Crime Age (relative to dataset max date) | Multiplier |
|------------------------------------------|-----------|
| ≤ 30 days | ×2.0 |
| ≤ 90 days | ×1.5 |
| ≤ 180 days | ×1.2 |
| ≤ 365 days | ×1.0 |
| Older | ×0.5 |

| Distance from centre | Decay |
|---------------------|-------|
| < 100 m | ×1.0 |
| < 200 m | ×0.9 |
| < 400 m | ×0.75 |
| < 600 m | ×0.6 |
| Beyond radius | Excluded |

**Score bands:**
- 75–100 → 🟢 SAFE
- 55–74  → 🟡 MODERATE
- 35–54  → 🟠 CAUTION
- 0–34   → 🔴 HIGH RISK

---

## Features

### Core
- ✅ Tap map twice to set origin → destination
- ✅ Type address with autocomplete (Nominatim, LA-bounded)
- ✅ GPS location for origin
- ✅ OSRM driving route drawn on map
- ✅ 500 LAPD incidents fetched per analysis
- ✅ Crime dot markers (red=violent, orange=property, purple=other)
- ✅ Full popup on each dot: crime, victim, address, weapon, date
- ✅ 8-card dashboard
- ✅ 3–5 destination case cards with full incident details
- ✅ Safety score 0–100 for origin, destination, and route
- ✅ Safety verdict + recommendations

### Authentication
- ✅ Email + password signup with validation
- ✅ Login with session persistence (localStorage)
- ✅ Guest mode
- ✅ Password strength meter
- ✅ Show/hide password toggles
- ✅ Form field error states

### UX
- ✅ Dark / Light mode toggle (persists)
- ✅ Hamburger menu on mobile
- ✅ Fully responsive (mobile, tablet, desktop)
- ✅ Toast notifications (success/warn/error/info)
- ✅ Loading overlay with animated rings
- ✅ Save routes to localStorage
- ✅ Filter incidents by type and year
- ✅ Search incidents by keyword

### Security (Bonus)
- ✅ XSS sanitisation on all API data inserted into DOM
- ✅ Input validation on auth forms
- ✅ Nginx security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
- ✅ No API keys exposed in frontend (LAPD token is public/rate-limit only)

---

## Challenges & Solutions

**1. URLSearchParams encodes `$` as `%24`**
Socrata's SODA API uses `$where`, `$limit` etc. Using `URLSearchParams` encodes `$` → `%24` which Socrata silently ignores, returning unfiltered random data. Solution: build the URL as a plain string — `$` stays literal, only *values* are `encodeURIComponent`'d.

**2. Dataset ends in 2024 but app runs in 2026**
Using `Date.now()` as the recency reference makes all 2020–2024 records appear 400–2200 days old, collapsing deductions to near-zero and making every area score SAFE. Solution: after each fetch, compute the newest crime date in the batch and use that as the reference for all age calculations.

**3. SVG `arc.className =` throws**
SVG `<path>` elements expose `.className` as a read-only `SVGAnimatedString`. Solution: use `arc.setAttribute('class', ...)` instead.

**4. Map tap origin/destination**
Used a `tapCount` state variable: first tap sets origin (also reverse-geocodes the label), second tap sets destination, counter resets.

---

## Attribution

- **LAPD Crime Data**: City of Los Angeles via [LA Open Data](https://data.lacity.org) — Public Domain
- **Map**: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · © [CARTO](https://carto.com)
- **Routing**: [Project OSRM](https://project-osrm.org/)
- **Geocoding**: [Nominatim / OpenStreetMap Foundation](https://nominatim.org/)
- **Leaflet.js**: [Vladimir Agafonkin](https://leafletjs.com/) — BSD 2-Clause
- **Font Awesome**: [Fonticons Inc.](https://fontawesome.com/) — CC BY 4.0
- **Fonts**: [Syne](https://fonts.google.com/specimen/Syne) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) — Google Fonts, SIL OFL
