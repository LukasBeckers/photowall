// Thin wrapper around the `qrcode` library. The previous hand-rolled encoder
// was missing version-info modules for v7+ and had a format-info placement
// off-by-one, both of which made QR codes unscannable for typical wall URLs
// (~140-160 chars). Library is ~80k weekly DLs and well-tested across readers.
import QRCode from 'qrcode';

export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M', // ~15% recovery; better real-world scans on TV
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
}
