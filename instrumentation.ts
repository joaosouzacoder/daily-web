export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startRefreshLoop } = await import('@/lib/refresher');
  const { getPomodoroState, onPhaseChange } = await import('@/lib/pomodoro');

  startRefreshLoop(Number(process.env.REFRESH_SECONDS ?? '300'));

  // getPomodoroState() lazily detects phase transitions and fires onPhaseChange
  // listeners as a side effect — it only runs when something calls it. This
  // interval is independent of startRefreshLoop's 300s data-refresh cadence and
  // exists solely to drive prompt phase detection for the ntfy fallback, so it
  // still fires even when no client has the dashboard open to poll /api/state.
  setInterval(() => {
    void getPomodoroState();
  }, 10_000);

  onPhaseChange((phase) => {
    const topic = process.env.NTFY_TOPIC;
    if (!topic) return;
    const message = phase === 'focus' ? 'Hora de focar' : 'Hora de descansar';
    fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message }).catch(() => {});
  });
}
