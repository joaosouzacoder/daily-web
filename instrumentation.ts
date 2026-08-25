export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startRefreshLoop } = await import('@/lib/refresher');
  const { onPhaseChange } = await import('@/lib/pomodoro');

  startRefreshLoop(Number(process.env.REFRESH_SECONDS ?? '300'));

  onPhaseChange((phase) => {
    const topic = process.env.NTFY_TOPIC;
    if (!topic) return;
    const message = phase === 'focus' ? 'Hora de focar' : 'Hora de descansar';
    fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message }).catch(() => {});
  });
}
