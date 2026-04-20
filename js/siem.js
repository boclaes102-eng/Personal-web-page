/**
 * siem.js
 * Sends security events to the CyberOps SIEM backend.
 * Events are fire-and-forget — they never block the UI.
 *
 * Usage:
 *   import { siemEvent } from './siem.js';
 *   siemEvent({ category: 'auth', action: 'login_failed', severity: 'medium', sourceIp: '1.2.3.4' });
 */

import { SIEM_WEBHOOK_URL, SIEM_WEBHOOK_SECRET } from './config.js';

/**
 * @typedef {'auth'|'network'|'threat'|'system'|'recon'} SiemCategory
 * @typedef {'critical'|'high'|'medium'|'low'|'info'} SiemSeverity
 *
 * @typedef {object} SiemEventOptions
 * @property {SiemCategory}   category
 * @property {string}         action       e.g. 'login_failed', 'login_success'
 * @property {SiemSeverity}  [severity]    defaults to 'info'
 * @property {string}        [sourceIp]
 * @property {string}        [message]
 * @property {object}        [rawData]
 */

/**
 * Send a security event to the SIEM (fire-and-forget, never throws).
 * @param {SiemEventOptions} opts
 */
export async function siemEvent(opts) {
  if (!SIEM_WEBHOOK_URL || !SIEM_WEBHOOK_SECRET) return;

  try {
    await fetch(`${SIEM_WEBHOOK_URL}/webhook/site-events`, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Webhook-Secret': SIEM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        source:   'personal-website',
        severity: 'info',
        ...opts,
      }),
    });
  } catch { /* never break the site */ }
}
