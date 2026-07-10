/// <reference types="@cloudflare/workers-types" />

// Global cache for Access JWKS
let cachedKeys: any = null;
let cachedKeysExpiry = 0;

async function getJwks(teamDomain: string): Promise<any> {
  const now = Date.now();
  if (cachedKeys && now < cachedKeysExpiry) {
    return cachedKeys;
  }
  const cleanDomain = teamDomain.replace(/^https?:\/\//, '');
  const url = `https://${cleanDomain}/cdn-cgi/access/certs`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${url}`);
  }
  const jwks = await response.json();
  cachedKeys = jwks;
  cachedKeysExpiry = now + 3600 * 1000; // cache for 1 hour
  return jwks;
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    if (pad === 1) {
      throw new Error('Invalid base64url string');
    }
    base64 += new Array(5 - pad).join('=');
  }
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function decodeJwtPart(part: string): any {
  const decodedBytes = base64UrlDecode(part);
  const decodedStr = new TextDecoder().decode(decodedBytes);
  return JSON.parse(decodedStr);
}

export async function verifyJwt(
  jwt: string,
  teamDomain: string | undefined,
  expectedAud: string | undefined
): Promise<boolean> {
  if (!teamDomain || !expectedAud) {
    console.error('JWT Verification: Missing team domain or expected audience env vars');
    return false;
  }

  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJwtPart(headerPart);
    const payload = decodeJwtPart(payloadPart);

    if (header.alg !== 'RS256') {
      console.error('JWT Verification: Unsupported algorithm:', header.alg);
      return false;
    }

    // Check expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      console.error('JWT Verification: Token has expired');
      return false;
    }

    // Check audience
    const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audArray.includes(expectedAud)) {
      console.error('JWT Verification: Audience mismatch. Expected:', expectedAud, 'Got:', payload.aud);
      return false;
    }

    // Fetch public keys
    const jwks = await getJwks(teamDomain);
    const keys = jwks.keys || [];
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) {
      console.error('JWT Verification: No matching public key found for kid:', header.kid);
      return false;
    }

    // Import JWK
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      false,
      ['verify']
    );

    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerPart}.${payloadPart}`);
    const signature = base64UrlDecode(signaturePart);

    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature as any,
      data as any
    );
  } catch (err) {
    console.error('JWT Verification error:', err);
    return false;
  }
}
