/**
 * CLI output helpers.
 * Standardized JSON output for success, structured error for failure.
 */

export function outputSuccess(data: unknown): void {
  console.log(JSON.stringify({ status: 'success', data }, null, 2));
}

export function outputError(message: string): void {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}
