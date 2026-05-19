export function load() {
  return {
    runtime: process.version,
    timestamp: new Date().toISOString(),
  }
}
