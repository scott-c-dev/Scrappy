// Joins class names, skipping the falsy ones: cx("a", on && "b").
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
