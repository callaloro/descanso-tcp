const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
const fmtShort = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const inRange = (x, start, end) => start <= end ? x >= start && x <= end : x >= start || x <= end;

function addOptions(select, from, to, step = 1) {
  for (let i = from; i <= to; i += step) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = pad(i);
    select.appendChild(option);
  }
}

addOptions($('depH'), 0, 23);
addOptions($('depM'), 0, 59);
addOptions($('fltH'), 8, 16);
addOptions($('fltM'), 0, 59);

let landings = 1;

const art79 = [
  { start: '07:01', end: '15:00', limits: { 1: '14:00', 2: '14:00' }, label: '07:01–15:00' },
  { start: '15:01', end: '18:00', limits: { 1: '13:30', 2: '13:00' }, label: '15:01–18:00' },
  { start: '18:01', end: '23:00', limits: { 1: '12:30', 2: '12:00' }, label: '18:01–23:00' },
  { start: '23:01', end: '06:00', limits: { 1: '11:30', 2: '11:00' }, label: '23:01–06:00' },
  { start: '06:01', end: '07:00', limits: { 1: '13:30', 2: '13:00' }, label: '06:01–07:00' }
];

const anexo10A = [
  { from: '08:01', to: '09:00', rest: '01:00', label: '08:01–09:00' },
  { from: '09:01', to: '10:00', rest: '01:15', label: '09:01–10:00' },
  { from: '10:01', to: '11:00', rest: '01:30', label: '10:01–11:00' },
  { from: '11:01', to: '12:00', rest: '02:00', label: '11:01–12:00' },
  { from: '12:01', to: '12:30', rest: '02:50', label: '12:01–12:30' }
];

const anexo10B = [
  { flightFrom: '10:01', flightTo: '11:00', actFrom: '11:46', actTo: '12:45', rules: [
    { min: 1, max: 30, rest: '01:45', label: '01–30 min' },
    { min: 31, max: 60, rest: '02:00', label: '31–60 min' }
  ] },
  { flightFrom: '11:01', flightTo: '12:00', actFrom: '12:46', actTo: '13:45', rules: [
    { min: 1, max: 30, rest: '02:15', label: '01–30 min' },
    { min: 31, max: 60, rest: '02:30', label: '31–60 min' },
    { min: 61, max: 999, rest: '02:45', label: 'Más de 60 min' }
  ] },
  { flightFrom: '12:01', flightTo: '12:30', actFrom: '13:46', actTo: '14:15', rules: [
    { min: 1, max: 999, rest: '02:55', label: 'Desde 01 min' }
  ] },
  { flightFrom: '12:31', flightTo: '13:30', actFrom: '14:16', actTo: '15:15', rules: [
    { min: 1, max: 30, rest: '02:55', label: '01–30 min' },
    { min: 31, max: 60, rest: '03:10', label: '31–60 min' },
    { min: 61, max: 999, rest: '03:25', label: 'Más de 60 min' }
  ] },
  { flightFrom: '13:31', flightTo: '14:30', actFrom: '15:16', actTo: '16:15', rules: [
    { min: 61, max: 150, rest: '03:25', label: '61–150 min' },
    { min: 151, max: 270, rest: '03:40', label: '151–270 min' }
  ] }
];

function getArt79Limit(dep, lands) {
  const row = art79.find((r) => inRange(dep, toMin(r.start), toMin(r.end)));
  if (!row) return null;
  return { row, limit: toMin(row.limits[lands]) };
}

function lookupAnexo10A(flightMinutes) {
  const row = anexo10A.find((r) => flightMinutes >= toMin(r.from) && flightMinutes <= toMin(r.to));
  return row ? { row, rest: toMin(row.rest) } : null;
}

function lookupAnexo10B(kind, value, excess) {
  for (const row of anexo10B) {
    const from = toMin(kind === 'flight' ? row.flightFrom : row.actFrom);
    const to = toMin(kind === 'flight' ? row.flightTo : row.actTo);
    if (value >= from && value <= to) {
      const rule = row.rules.find((r) => excess >= r.min && excess <= r.max);
      if (rule) return { kind, row, rule, rest: toMin(rule.rest) };
    }
  }
  return null;
}

function calculate(dep, flightMinutes, lands) {
  const activity = flightMinutes + 105;
  const art = getArt79Limit(dep, lands);
  if (!art) throw new Error('La hora de despegue no encaja en el Artículo 79 cargado.');
  const excess = activity - art.limit;

  if (excess <= 0) {
    const detailA = lookupAnexo10A(flightMinutes);
    if (!detailA) throw new Error('Actividad dentro de límites, pero la franja no está cargada en Anexo 10A.');
    return { type: '10A', rest: detailA.rest, activity, limit: art.limit, artRow: art.row, excess, detailA };
  }

  const byFlight = lookupAnexo10B('flight', flightMinutes, excess);
  const byActivity = lookupAnexo10B('activity', activity, excess);
  const candidates = [byFlight, byActivity].filter(Boolean);
  if (!candidates.length) throw new Error('Actividad excedida, pero la franja no está cargada en Anexo 10B.');
  const best = candidates.reduce((a, b) => (a.rest >= b.rest ? a : b));
  return { type: '10B', rest: best.rest, activity, limit: art.limit, artRow: art.row, excess, byFlight, byActivity, best };
}

function getInput() {
  return {
    dep: Number($('depH').value) * 60 + Number($('depM').value),
    flight: Number($('fltH').value) * 60 + Number($('fltM').value),
    landings
  };
}

function save() {
  localStorage.setItem('descansoTcpV2', JSON.stringify({
    depH: $('depH').value, depM: $('depM').value,
    fltH: $('fltH').value, fltM: $('fltM').value,
    landings
  }));
}

function load() {
  const saved = localStorage.getItem('descansoTcpV2');
  const defaults = { depH: '16', depM: '25', fltH: '12', fltM: '40', landings: 1 };
  let data = defaults;
  if (saved) {
    try { data = { ...defaults, ...JSON.parse(saved) }; } catch {}
  }
  $('depH').value = data.depH;
  $('depM').value = data.depM;
  $('fltH').value = data.fltH;
  $('fltM').value = data.fltM;
  landings = Number(data.landings) || 1;
  syncLandingButtons();
}

function syncLandingButtons() {
  $('seg1').classList.toggle('active', landings === 1);
  $('seg2').classList.toggle('active', landings === 2);
}

function renderCalculation(result, input) {
  const warning = result.type === '10B';
  let html = `
    <p class="kicker">${warning ? 'Supera límite · Anexo 10B' : 'Dentro de límite · Anexo 10A'}</p>
    <div class="rest ${warning ? 'warn' : ''}">${fmt(result.rest)}</div>
    <p class="summary">Actividad ${fmtShort(result.activity)} · Límite ${fmtShort(result.limit)} · ${result.excess > 0 ? `exceso ${result.excess} min` : 'sin exceso'}</p>
    <button class="details-toggle" type="button" id="detailsToggle">Ver cálculo</button>
    <div class="details" id="details">
      <div class="row"><b>Hora de despegue</b><span>${pad(Math.floor(input.dep / 60))}:${pad(input.dep % 60)}</span></div>
      <div class="row"><b>Tiempo de vuelo baremo</b><span>${fmtShort(input.flight)}</span></div>
      <div class="row"><b>Actividad</b><span>${fmtShort(result.activity)} = vuelo + 1:45</span></div>
      <div class="row"><b>Artículo 79</b><span>${result.artRow.label} · ${input.landings} aterrizaje${input.landings > 1 ? 's' : ''}</span></div>
      <div class="row"><b>Límite actividad aérea</b><span>${fmtShort(result.limit)}</span></div>
      <div class="row"><b>Exceso</b><span>${result.excess > 0 ? `${result.excess} min` : 'No supera'}</span></div>`;

  if (result.type === '10A') {
    html += `
      <div class="row"><b>Anexo 10A</b><span>${result.detailA.row.label}</span></div>
      <div class="row"><b>Descanso mínimo</b><span>${fmt(result.rest)}</span></div>`;
  } else {
    html += `
      <div class="row"><b>Anexo 10B por vuelo</b><span>${result.byFlight ? `${result.byFlight.row.flightFrom}–${result.byFlight.row.flightTo} · ${result.byFlight.rule.label} → ${fmt(result.byFlight.rest)}` : 'No aplica'}</span></div>
      <div class="row"><b>Anexo 10B por actividad</b><span>${result.byActivity ? `${result.byActivity.row.actFrom}–${result.byActivity.row.actTo} · ${result.byActivity.rule.label} → ${fmt(result.byActivity.rest)}` : 'No aplica'}</span></div>
      <div class="row"><b>Criterio aplicado</b><span>Mayor descanso favorable: ${fmt(result.rest)}</span></div>`;
  }

  html += `</div><p class="note">Herramienta de apoyo basada en las tablas cargadas del XIII Convenio TCP. Revisar ante cambios de convenio.</p>`;
  showResult(html);
  $('detailsToggle').addEventListener('click', () => $('details').classList.toggle('open'));
}

function showError(message) {
  showResult(`<div class="error">${message}</div>`);
}

function showResult(html) {
  const result = $('result');
  result.classList.remove('show');
  result.innerHTML = html;
  result.style.display = 'block';
  setTimeout(() => result.classList.add('show'), 40);
}

$('seg1').addEventListener('click', () => { landings = 1; syncLandingButtons(); save(); });
$('seg2').addEventListener('click', () => { landings = 2; syncLandingButtons(); save(); });
['depH', 'depM', 'fltH', 'fltM'].forEach((id) => $(id).addEventListener('change', save));

$('calcForm').addEventListener('submit', (event) => {
  event.preventDefault();
  save();
  if (navigator.vibrate) navigator.vibrate(12);
  const input = getInput();
  try { renderCalculation(calculate(input.dep, input.flight, input.landings), input); }
  catch (error) { showError(error.message); }
});

$('clear').addEventListener('click', () => {
  localStorage.removeItem('descansoTcpV2');
  $('depH').value = '16'; $('depM').value = '25'; $('fltH').value = '12'; $('fltM').value = '40';
  landings = 1; syncLandingButtons();
  $('result').classList.remove('show');
  $('result').style.display = 'none';
});

$('infoBtn').addEventListener('click', () => $('infoDialog').showModal());
$('closeInfo').addEventListener('click', () => $('infoDialog').close());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}

load();
