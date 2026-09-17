// Password hashing using Web Crypto API for Cloudflare Workers
// Replaces bcryptjs which uses eval() (not allowed in Workers)

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 10000;
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt,
      iterations: iterations
    },
    keyMaterial,
    256
  );

  return `pbkdf2:${iterations}:${bufToHex(salt)}:${bufToHex(hashBuffer)}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyPassword(password, storedHash) {
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;
    
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const originalHashHex = parts[3];
    
    const salt = hexToBuf(saltHex);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt,
        iterations: iterations
      },
      keyMaterial,
      256
    );

    const derivedHashHex = bufToHex(hashBuffer);
    
    return timingSafeEqual(originalHashHex, derivedHashHex);
  } else {
    // Legacy SHA-256 fallback
    const passwordHash = await sha256(password);
    return timingSafeEqual(passwordHash, storedHash);
  }
}

export function isLegacyHash(storedHash) {
  return !storedHash.startsWith('pbkdf2:');
}
