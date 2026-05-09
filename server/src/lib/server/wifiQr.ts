// Build the standardised WIFI: payload that iOS/Android phones recognise
// from a QR code as "join this network". Per the (informal but de-facto)
// spec, certain characters in SSID and password must be backslash-escaped:
// `\`, `;`, `,`, `:`, and double-quote.
//
//   Format: WIFI:T:<auth>;S:<ssid>;P:<password>;;
//   where <auth> is WPA (also covers WPA2/WPA3 in practice), WEP, or nopass.

export type WifiAuth = 'WPA' | 'WEP' | 'nopass';

function escape(s: string): string {
  return s.replace(/[\\;,:"]/g, (c) => '\\' + c);
}

export function buildWifiPayload(opts: {
  ssid: string;
  password: string;
  auth: WifiAuth;
}): string {
  const ssid = escape(opts.ssid);
  if (opts.auth === 'nopass') {
    return `WIFI:T:nopass;S:${ssid};;`;
  }
  return `WIFI:T:${opts.auth};S:${ssid};P:${escape(opts.password)};;`;
}
