'use strict';
/* ═══════════════════════════════════════════════════════════════
   export.js — Data Export Feature
   Bonus feature: export crime incidents as JSON, CSV, or PDF
   Triggered from the Incidents panel toolbar
═══════════════════════════════════════════════════════════════ */

/* ── EXPORT AS JSON ───────────────────────────────────────────── */
function exportJSON() {
  if (!APP.crimes?.length) { toast('Run an analysis first.', 'warn'); return; }

  const data = {
    exported: new Date().toISOString(),
    source: 'LAPD Crime Data 2020–2024 — data.lacity.org',
    origin: APP.originLabel || '—',
    destination: APP.destLabel || '—',
    radiusKm: APP.radiusKm,
    totalRecords: APP.crimes.length,
    crimes: APP.crimes.map(c => ({
      id: c.id,
      date: c.date ? c.date.toISOString().split('T')[0] : null,
      time: c.timeStr || null,
      type: c.desc,
      category: c.cat,
      address: c.address,
      area: c.area,
      premise: c.premis,
      weapon: c.weapon || null,
      victimSex: c.victSex || null,
      victimAge: c.victAge > 0 ? c.victAge : null,
      status: c.status,
      latitude: c.lat,
      longitude: c.lng,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `saferoute-incidents-${dateStamp()}.json`);
  toast(`Exported ${APP.crimes.length} records as JSON`, 'success');
}

/* ── EXPORT AS CSV ────────────────────────────────────────────── */
function exportCSV() {
  if (!APP.crimes?.length) { toast('Run an analysis first.', 'warn'); return; }

  const headers = [
    'Date', 'Time', 'Crime Type', 'Category', 'Address', 'LAPD Area',
    'Premise', 'Weapon', 'Victim Sex', 'Victim Age', 'Case Status', 'Latitude', 'Longitude'
  ];

  const rows = APP.crimes.map(c => [
    c.date ? c.date.toISOString().split('T')[0] : '',
    c.timeStr || '',
    csvEsc(c.desc),
    c.cat,
    csvEsc(c.address),
    csvEsc(c.area),
    csvEsc(c.premis),
    csvEsc(c.weapon),
    c.victSex || '',
    c.victAge > 0 ? c.victAge : '',
    csvEsc(c.status),
    c.lat,
    c.lng,
  ]);

  const csv = [
    // Metadata header
    `# SafeRoute LA — Crime Data Export`,
    `# Source: LAPD Crime Data 2020–2024 (data.lacity.org)`,
    `# Origin: ${APP.originLabel || '—'}`,
    `# Destination: ${APP.destLabel || '—'}`,
    `# Exported: ${new Date().toLocaleString('en-US')}`,
    `# Total Records: ${APP.crimes.length}`,
    '',
    headers.join(','),
    ...rows.map(r => r.join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `saferoute-incidents-${dateStamp()}.csv`);
  toast(`Exported ${APP.crimes.length} records as CSV`, 'success');
}

/* ── EXPORT AS PDF ────────────────────────────────────────────── */
function exportPDF() {
  if (!APP.crimes?.length) { toast('Run an analysis first.', 'warn'); return; }

  const rl = riskLevel(APP.lastScore || 0);
  const dateNow = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const refLabel = APP.refDate
    ? APP.refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  // Build HTML for print — opens in new tab then triggers print dialog
  const rows = APP.crimes.slice(0, 100).map((c, i) => {
    const catColor = c.cat === 'violent' ? '#dc2626' : c.cat === 'property' ? '#d97706' : '#7c3aed';
    return `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td>${c.date ? c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
      <td style="font-weight:600;color:${catColor}">${xss(capWords(c.desc))}</td>
      <td><span style="background:${catColor}18;color:${catColor};padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600">${c.cat.toUpperCase()}</span></td>
      <td>${xss(c.address)}</td>
      <td>${xss(c.area)}</td>
      <td>${c.victSex === 'M' ? 'Male' : c.victSex === 'F' ? 'Female' : '—'}</td>
      <td>${c.victAge > 0 ? c.victAge : '—'}</td>
      <td style="color:${c.weapon ? '#dc2626' : '#94a3b8'}">${c.weapon ? xss(capWords(c.weapon)) : 'None'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>SafeRoute LA — Crime Intelligence Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
    .header { border-bottom: 3px solid #144491; padding-bottom: 16px; margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; }
    .brand { font-size: 22px; font-weight: 800; color: #144491; letter-spacing: .04em; }
    .brand span { color: #f59e0b; }
    .brand-sub { font-size: 10px; color: #64748b; letter-spacing: .14em; text-transform: uppercase; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.8; }
    .score-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .score-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
    .score-box .label { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 4px; }
    .score-box .value { font-size: 24px; font-weight: 800; }
    .score-box .sub { font-size: 11px; color: #64748b; }
    .section-title { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #144491; color: #fff; text-align: left; padding: 8px 10px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 16px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SAFE<span>ROUTE</span> LA</div>
      <div class="brand-sub">Crime Intelligence Report</div>
    </div>
    <div class="meta">
      <strong>Exported:</strong> ${dateNow}<br/>
      <strong>Data:</strong> LAPD 2020–2024 (latest: ${refLabel})<br/>
      <strong>Source:</strong> data.lacity.org
    </div>
  </div>

  <div class="score-row">
    <div class="score-box">
      <div class="label">Route Analyzed</div>
      <div class="value" style="font-size:13px;margin-top:4px">${xss(APP.originLabel?.split(',')[0] || '—')} → ${xss(APP.destLabel?.split(',')[0] || '—')}</div>
    </div>
    <div class="score-box">
      <div class="label">Safety Score</div>
      <div class="value" style="color:${rl.color}">${APP.lastScore || '—'}<span style="font-size:14px">/100</span></div>
      <div class="sub">${rl.label}</div>
    </div>
    <div class="score-box">
      <div class="label">Incidents Found</div>
      <div class="value">${APP.crimes.length}</div>
      <div class="sub">within ${APP.radiusKm}km corridor</div>
    </div>
    <div class="score-box">
      <div class="label">Radius</div>
      <div class="value">${APP.radiusKm}<span style="font-size:14px">km</span></div>
      <div class="sub">search corridor</div>
    </div>
  </div>

  <div class="section-title">Incident Records${APP.crimes.length > 100 ? ' (showing first 100 of ' + APP.crimes.length + ')' : ''}</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Crime Type</th>
        <th>Category</th>
        <th>Address</th>
        <th>LAPD Area</th>
        <th>Victim Sex</th>
        <th>Victim Age</th>
        <th>Weapon</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    SafeRoute LA — Crime Intelligence Platform &nbsp;|&nbsp;
    Data: LAPD Open Data Portal (data.lacity.org) &nbsp;|&nbsp;
    This report is for informational purposes only.
    Always check official sources before making safety decisions.
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Please allow popups to export PDF.', 'warn'); return; }
  win.document.write(html);
  win.document.close();
  toast('PDF report opened — use your browser\'s Print → Save as PDF.', 'success');
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function csvEsc(v) {
  if (!v) return '';
  const s = String(v).replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function dateStamp() {
  return new Date().toISOString().split('T')[0];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Inject Export toolbar into Incidents panel ───────────────── */
function renderExportBar() {
  if (document.getElementById('export-bar')) return;

  const incBar = document.querySelector('.inc-bar');
  if (!incBar) return;

  const bar = document.createElement('div');
  bar.id = 'export-bar';
  bar.innerHTML = `
    <button class="exp-btn ejson" onclick="exportJSON()" title="Export as JSON"> JSON
    </button>
    <button class="exp-btn ecsv" onclick="exportCSV()" title="Export as CSV">
      <i class="fa-solid fa-table"></i> CSV
    </button>`;

  incBar.appendChild(bar);
}