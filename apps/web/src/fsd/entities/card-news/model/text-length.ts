/** JSON Schema maxLength and Python len count Unicode code points. */
export function countCardNewsTextCodePoints(text: string): number {
  return Array.from(text).length;
}
