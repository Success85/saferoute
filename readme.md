# 🛡️ LA SafeNav — LAPD Crime Intelligence

Real-time Los Angeles crime analysis powered exclusively by **LAPD open data** (2020–2024) via the Socrata SODA API.

---

## Live Data Source

```
https://data.lacity.org/resource/2nrs-mtv8.json
```
Dataset: **Crime Data from 2020 to 2024** — Los Angeles Police Department  
License: Public Domain · Published by: City of Los Angeles Open Data Portal

---

## Features

| Feature | Details |
|---|---|
| 🗺️ Interactive Map | Leaflet.js + CartoDB tiles (dark/light) |
| 🚗 Route Planning | OSRM routing via Leaflet Routing Machine |
| 📡 Live LAPD Crime Data | Socrata SODA API — dynamic bounding box query |
| 🎯 Safety Scores (0–100) | Per-location weighted algorithm |
| 📊 Analysis Dashboard | 8-panel horizontal layout below the map |
| 📱 Fully Responsive | Horizontal row on large screens, stacked blocks on mobile |
| 🌙 Dark / Light Mode | CSS variables + localStorage persistence |
| 🔍 Geocoding | Nominatim (OpenStreetMap) — LA-bounded |
| 📍 GPS Location | HTML5 Geolocation API |
| ⇄ Origin/Dest Swap | One-click swap button |
| 🎛️ Analysis Radius | Adjustable 0.5–5 km slider |

---

## Real LAPD API Fields Used

| Field | Description |
|---|---|
| `lat` | Latitude coordinate |
| `lon` | Longitude coordinate |
| `date_occ` | Date of crime occurrence (ISO 8601) |
| `time_occ` | Time in military format (e.g. `"0845"`) |
| `crm_cd_desc` | Crime description (e.g. `"ASSAULT WITH DEADLY WEAPON"`) |
| `area_name` | LAPD geographic area / division |
| `premis_desc` | Premise type (e.g. `"SIDEWALK"`, `"SINGLE FAMILY DWELLING"`) |
| `weapon_desc` | Weapon used (nullable) |
| `vict_sex` | Victim sex (`M`, `F`, `X`) |
| `vict_age` | Victim age (numeric) |
| `vict_descent` | Victim descent code |
| `status_desc` | Case status (e.g. `"Invest Cont"`) |
| `part_1_2` | Crime seriousness (`1` = most serious, `2` = secondary) |
| `location` | Street address (rounded to nearest 100 block for privacy) |
| `dr_no` | Division of Records Number (unique ID) |

### SoQL Query Structure

```
GET https://data.lacity.org/resource/2nrs-mtv8.json
  ?$limit=1000
  &$order=date_occ DESC
  &$select=dr_no,date_occ,time_occ,crm_cd_desc,area_name,premis_desc,
           weapon_desc,vict_sex,vict_age,vict_descent,status_desc,
           part_1_2,location,lat,lon
  &$where=lat IS NOT NULL AND lon IS NOT NULL
          AND lat != '0.0' AND lon != '0.0'
          AND lat > '{minLat}' AND lat < '{maxLat}'
          AND lon > '{minLng}' AND lon < '{maxLng}'
          AND date_occ >= '2020-01-01T00:00:00'
```

---

## Safety Scoring Algorithm

**Score = max(0, min(100, 100 − Σ deductions))**

### Deduction per incident

| Crime Category | Base Weight |
|---|---|
| Violent, Part 1 (homicide, rape, robbery, assault) | −12 |
| Violent, Part 2 | −9 |
| Property crime (burglary, theft, vehicle theft) | −4 |
| Other | −1.5 |

### Recency Multiplier

| Age of Crime | Multiplier |
|---|---|
| ≤ 30 days | ×2.0 |
| ≤ 90 days | ×1.4 |
| ≤ 365 days | ×1.0 |
| Older | ×0.5 |

### Distance Decay (from analysis center)

| Distance | Multiplier |
|---|---|
| < 200 m | ×1.0 |
| 200–400 m | ×0.75 |
| 400 m–radius | ×0.45 |
| Beyond radius | Excluded |

### Score Bands

| Range | Label | Color |
|---|---|---|
| 70–100 | SAFE | 🟢 Green |
| 45–69 | MODERATE | 🟡 Amber |
| 0–44 | HIGH RISK | 🔴 Red |

---

## Layout

```
┌─────────────────────────────────────────┐
│                 HEADER                  │
│  Logo · [Origin input] · [Dest input]   │
│                 · [Analyze]             │
├─────────────────────────────────────────┤
│                                         │
│             MAP (52vh)                  │
│         Leaflet + OSRM Route            │
│         Crime incident markers          │
│                                         │
├─────────────────────────────────────────┤
│         ANALYSIS DASHBOARD              │
│                                         │
│  Large screen (≥1280px): 4 columns      │
│  ┌──────┬──────┬──────┬──────────────┐  │
│  │Orig  │Route │Dest  │Breakdown     │  │
│  │Score │Stats │Score │(bar chart)   │  │
│  ├──────┴──────┼──────┴──────────────┤  │
│  │Demographics │Incidents (scrollable)│  │
│  ├─────────────┼──────────────────────┤  │
│  │Weapons      │LAPD Districts        │  │
│  └─────────────┴──────────────────────┘  │
│                                         │
│  Medium screen (900–1280px): 2 columns  │
│  Small screen (<900px): single column  │
│  (each card full-width stacked block)  │
└─────────────────────────────────────────┘
```

---

## Getting Started

```bash
# Serve locally (required — must not use file:// due to CORS)
python -m http.server 8080
# OR
npx serve .
```

Open `http://localhost:8080`

---

## Tech Stack (100% Free & Open Source)

| Library | Purpose | License |
|---|---|---|
| Leaflet.js 1.9.4 | Interactive map | BSD 2-Clause |
| Leaflet Routing Machine | OSRM routing | ISC |
| OSRM | Turn-by-turn routing engine | BSD 2-Clause |
| CartoDB Basemaps | Map tiles (dark/light) | CC BY 3.0 |
| Nominatim | Geocoding | ODbL |
| Font Awesome 6 | Icons | CC BY 4.0 |
| Google Fonts (Barlow Condensed, Space Mono, Inter) | Typography | SIL OFL |

---

## Attribution

- **Crime Data**: Los Angeles Police Department via [LA City Open Data](https://data.lacity.org/Public-Safety/Crime-Data-from-2020-to-2024/2nrs-mtv8) — Public Domain
- **Map Tiles**: © [CARTO](https://carto.com) / © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- **Routing**: © [Project OSRM](https://project-osrm.org/)
- **Geocoding**: © [OpenStreetMap Foundation / Nominatim](https://nominatim.org/)


