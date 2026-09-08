const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Count consecutive scheduled completions; today's unfinished habit is still due. */
export function habitStreaks(
  habit: { days: number[]; created: string; checks: string[] },
  today = localDate(),
) {
  const checks = new Set(
    habit.checks.filter((day) => day >= habit.created && day <= today),
  );
  const first = [...checks].sort()[0];
  if (!first || !habit.days.length) return { current: 0, best: 0 };
  let current = 0,
    best = 0;
  const cursor = new Date(first + "T12:00:00");
  while (localDate(cursor) <= today) {
    const day = localDate(cursor);
    const scheduled = habit.days.includes((cursor.getDay() + 6) % 7);
    if (scheduled) {
      if (checks.has(day)) {
        current++;
        best = Math.max(best, current);
      } else if (day !== today) current = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { current, best };
}
