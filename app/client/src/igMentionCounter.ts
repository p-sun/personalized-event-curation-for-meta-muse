export function shouldShowIgMentionCounter(enabled: boolean, count: number): boolean {
  return enabled && count > 0;
}

export function igMentionCounterLabel(count: number): string {
  return `${count} IG mention${count === 1 ? "" : "s"}`;
}
