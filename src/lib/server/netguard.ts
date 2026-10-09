/* Keeps a user-supplied base URL from pointing Scrappy's server at its own
   network. Requests go through the server, so "http://192.168.1.20" would be
   looked up on the host's network, not the user's — on a hosted Scrappy that
   lets a visitor reach machines the host never meant to expose.

   Private, loopback, link-local and similar addresses are refused unless
   ALLOW_PRIVATE_LLM_URLS=1 (for people running Scrappy on their own network).
   The check resolves the hostname first; LLM calls also refuse redirects, so a
   public URL can't bounce the request somewhere private. */

import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class PrivateAddressError extends Error {}

export const privateUrlsAllowed = () => {
  const v = process.env.ALLOW_PRIVATE_LLM_URLS?.trim().toLowerCase();
  return !!v && v !== "0" && v !== "false";
};

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

function privateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateV4(mapped[1]);
  return (
    v === "::" ||
    v === "::1" ||
    /^f[cd]/.test(v) || // unique local fc00::/7
    /^fe[89ab]/.test(v) || // link-local fe80::/10
    /^ff/.test(v) // multicast
  );
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return privateV4(ip);
  if (kind === 6) return privateV6(ip);
  return true;
}

/* Throws PrivateAddressError when the URL's host is (or resolves to) a
   private address. DNS failures are left to the request itself, which then
   fails as "can't reach". */
export async function assertPublicUrl(url: string): Promise<void> {
  if (privateUrlsAllowed()) return;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new PrivateAddressError("not a valid address");
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new PrivateAddressError("private address");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new PrivateAddressError("private address");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return;
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new PrivateAddressError("private address");
  }
}
