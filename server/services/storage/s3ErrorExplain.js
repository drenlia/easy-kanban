/**
 * Map raw AWS / S3-compatible SDK errors to stable codes + admin-facing English text.
 * The UI may further translate by `code`.
 */

/**
 * @param {unknown} err
 * @returns {{ code: string, message: string, technical: string }}
 */
export function explainS3TestError(err) {
  const technical = extractTechnicalMessage(err);
  const lower = technical.toLowerCase();
  const name = String(err?.name || err?.Code || err?.code || '');

  if (
    lower.includes('temporary endpoint') ||
    lower.includes('permanentredirect') ||
    name === 'PermanentRedirect' ||
    lower.includes('the bucket you are attempting to access must be addressed using the specified endpoint')
  ) {
    return {
      code: 'region_endpoint_mismatch',
      message:
        'The bucket is in a different region than the Region / Endpoint you entered. ' +
        'Open the bucket in your cloud console, copy its exact region (e.g. eu-west-1), ' +
        'set Region to that value, and for AWS you can leave Endpoint as https://s3.amazonaws.com ' +
        '(or use https://s3.<region>.amazonaws.com). Leave “Force path-style URLs” off for AWS.',
      technical
    };
  }

  if (
    lower.includes('invalidaccesskeyid') ||
    name === 'InvalidAccessKeyId' ||
    lower.includes('the aws access key id you provided does not exist')
  ) {
    return {
      code: 'invalid_access_key',
      message:
        'The Access key ID is not recognized. Check that you copied the full key and that it belongs to this account / bucket.',
      technical
    };
  }

  if (
    lower.includes('signaturedoesnotmatch') ||
    name === 'SignatureDoesNotMatch' ||
    lower.includes('the request signature we calculated does not match')
  ) {
    return {
      code: 'invalid_secret',
      message:
        'The Secret access key does not match the Access key ID (or the clock on this server is wrong). Re-paste the secret carefully; for AWS leave Force path-style off.',
      technical
    };
  }

  if (lower.includes('nosuchbucket') || name === 'NoSuchBucket') {
    return {
      code: 'no_such_bucket',
      message:
        'No bucket with that name was found for this account/endpoint. Check the bucket name spelling and that Region / Endpoint match where the bucket lives.',
      technical
    };
  }

  if (lower.includes('accessdenied') || name === 'AccessDenied' || lower.includes('not authorized')) {
    return {
      code: 'access_denied',
      message:
        'Credentials are valid but not allowed to read/write this bucket. Grant s3:PutObject, s3:GetObject, and s3:DeleteObject (at least) on the bucket or prefix.',
      technical
    };
  }

  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('networkingerror') ||
    lower.includes('getaddrinfo')
  ) {
    return {
      code: 'network',
      message:
        'Could not reach the S3 endpoint from this server. Check the Endpoint URL, DNS, and that the instance can access the internet (or your private MinIO host).',
      technical
    };
  }

  if (lower.includes('ssl') || lower.includes('certificate') || lower.includes('tls')) {
    return {
      code: 'tls',
      message:
        'TLS/SSL failed talking to the endpoint. Check that the Endpoint uses https:// and that the certificate is valid (common with self-signed MinIO).',
      technical
    };
  }

  return {
    code: 'unknown',
    message:
      technical ||
      'S3 test failed. Check bucket name, region, endpoint, and access keys, then try again.',
    technical
  };
}

function extractTechnicalMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const parts = [
    err.message,
    err.Message,
    err.Code,
    err.code,
    err.name,
    err.$metadata?.httpStatusCode ? `HTTP ${err.$metadata.httpStatusCode}` : ''
  ].filter(Boolean);
  return parts.join(' — ') || String(err);
}
