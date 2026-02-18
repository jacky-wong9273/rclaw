/**
 * Build CSP header for the Control UI.
 *
 * Security hardening applied:
 * - style-src: 'unsafe-inline' retained because the Lit-based UI relies on
 *   inline style attributes in templates. When the UI migrates to adoptedStyleSheets
 *   this should be tightened.
 * - img-src: restricted to 'self' and data: only (removed blanket https: to
 *   prevent data exfiltration via image requests to arbitrary domains).
 * - connect-src: only wss: allowed in addition to 'self'; plain ws: removed
 *   to prevent unencrypted WebSocket connections in deployment. Local dev
 *   behind localhost uses 'self' which covers ws://localhost already.
 * - form-action: restricted to 'self' to prevent form-based exfiltration.
 * - upgrade-insecure-requests: forces HTTPS for sub-resource loads.
 */
export function buildControlUiCspHeader(): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' wss:",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
