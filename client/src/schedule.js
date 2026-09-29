// Date math for the master schedule. Dates are 'YYYY-MM-DD' strings handled in UTC so they
// never shift with the browser's time zone.
const DAY = 86400000;
export const toMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
export const toYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd, n) => toYmd(toMs(ymd) + n * DAY);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);

export function computeTasks(settings, tasks) {
  if (!settings) return [];
  return tasks.map((t) => {
    const anchorDate = settings.anchors[t.anchor];
    const duration = t.type === 'Milestone' ? 0 : (t.use_hypercare ? settings.hypercare_days : t.duration_days);
    const start = addDays(anchorDate, t.offset_days);
    const end = duration === 0 ? start : addDays(start, duration - 1);
    return { ...t, duration, start, end, weeks: Math.round((duration / 7) * 10) / 10 };
  });
}

export function phaseSpans(computed, phases) {
  return phases.map((p) => {
    const kids = computed.filter((t) => t.phase === p.code);
    if (!kids.length) return { ...p, start: null, end: null, tasks: [] };
    const start = kids.reduce((m, t) => (t.start < m ? t.start : m), kids[0].start);
    const end = kids.reduce((m, t) => (t.end > m ? t.end : m), kids[0].end);
    return { ...p, start, end, tasks: kids };
  });
}

export const fmtD = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' }) : '');
export const fmtShort = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const todayYmd = () => {
  // Today in Manila
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
};

// Theme-aware phase colour, falling back to the colour in the register definition.
export const phaseColor = (p) => (p.custom ? p.dark : `var(--ph-${p.code}, ${p.dark})`);
