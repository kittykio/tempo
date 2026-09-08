export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function rangeFor(period: string, anchor: string) {
  const start = new Date(anchor + "T12:00:00");
  const end = new Date(start);
  if (period === "weekly") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  }
  if (period === "monthly") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  if (period === "yearly") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return { start: localDate(start), end: localDate(end) };
}
