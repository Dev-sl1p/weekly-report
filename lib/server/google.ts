import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
export type GoogleIdentity = { sub: string; email: string; name: string };
export async function verifyGoogle(
  credential: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(credential, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'email_verified', 'exp', 'iat', 'nonce'],
  });
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.email !== 'string' ||
    typeof payload.sub !== 'string' ||
    !payload.sub
  )
    throw new Error('Invalid Google identity');
  const email = payload.email.toLowerCase();
  if (
    !email.endsWith('@gmail.com') &&
    !(typeof payload.hd === 'string' && payload.hd)
  )
    throw new Error('Use a Gmail or Google Workspace account');
  return {
    sub: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name.slice(0, 150) : email,
  };
}
