/**
 * Strip HTML tags from user-submitted text to prevent XSS.
 * Preserves the inner text content.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
