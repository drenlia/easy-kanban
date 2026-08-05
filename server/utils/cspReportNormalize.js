/**
 * Normalize browser CSP report payloads (legacy report-uri + Reporting API).
 */

function truncate(value, max) {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function asInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * @param {unknown} body
 * @param {string|undefined} userAgent
 * @returns {Array<object>}
 */
export function normalizeCspReportBody(body, userAgent) {
  const rows = [];

  const pushLegacy = (report) => {
    if (!report || typeof report !== 'object') return;
    rows.push({
      documentUri: truncate(report['document-uri'] ?? report.documentUri ?? report.documentURL, 2048),
      violatedDirective: truncate(
        report['violated-directive'] ??
          report['effective-directive'] ??
          report.violatedDirective ??
          report.effectiveDirective,
        256
      ),
      blockedUri: truncate(report['blocked-uri'] ?? report.blockedUri ?? report.blockedURL, 2048),
      sourceFile: truncate(report['source-file'] ?? report.sourceFile, 2048),
      lineNumber: asInt(report['line-number'] ?? report.lineNumber),
      userAgent: truncate(userAgent, 512),
      raw: report
    });
  };

  if (Array.isArray(body)) {
    for (const item of body) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'csp-violation' && item.body) {
        pushLegacy({
          'document-uri': item.body.documentURL ?? item.body['document-uri'],
          'violated-directive':
            item.body.effectiveDirective ??
            item.body.violatedDirective ??
            item.body['violated-directive'],
          'blocked-uri': item.body.blockedURL ?? item.body['blocked-uri'],
          'source-file': item.body.sourceFile ?? item.body['source-file'],
          'line-number': item.body.lineNumber ?? item.body['line-number'],
          ...item.body
        });
      } else if (item['csp-report']) {
        pushLegacy(item['csp-report']);
      } else {
        pushLegacy(item);
      }
    }
  } else if (body && typeof body === 'object') {
    if (body['csp-report']) {
      pushLegacy(body['csp-report']);
    } else {
      pushLegacy(body);
    }
  }

  return rows.filter((r) => r.violatedDirective || r.blockedUri || r.documentUri);
}
