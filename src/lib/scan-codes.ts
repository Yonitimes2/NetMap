/**
 * What a barcode or QR code read from an equipment label holds. Labels carry a serial number,
 * a MAC address, a model or part number, or a QR code with several of them ("SN:… MAC:…").
 */
export interface ScannedCode {
  raw: string;
  serial?: string;
  mac?: string;
  /** a web address (a cloud / P2P link): shown, but not a serial number */
  link?: boolean;
}

const HEX_PAIR = "[0-9A-F]{2}";
const MAC_RE = new RegExp(`(${HEX_PAIR})[:-]?(${HEX_PAIR})[:-]?(${HEX_PAIR})[:-]?(${HEX_PAIR})[:-]?(${HEX_PAIR})[:-]?(${HEX_PAIR})`, "i");

/** "aabbccddeeff" / "AA-BB-…" → "AA:BB:CC:DD:EE:FF" */
const formatMac = (m: RegExpMatchArray) => m.slice(1, 7).join(":").toUpperCase();

export function readCode(raw: string): ScannedCode {
  const text = raw.trim();
  const out: ScannedCode = { raw: text };
  // labelled fields, as QR codes and some barcodes carry them
  const sn = text.match(/(?:^|[\s;,&?|])(?:S\/?N|SERIAL(?:[\s_]?(?:NO|NUMBER))?)\s*[:#=]?\s*([A-Z0-9][A-Z0-9_./-]{3,})/i);
  const mac = text.match(new RegExp(`MAC\\s*[:#=]?\\s*${MAC_RE.source}`, "i"));
  if (sn) out.serial = sn[1];
  if (mac) out.mac = formatMac(mac);
  if (sn || mac) return out;

  if (/^https?:\/\//i.test(text)) {
    out.link = true;
    try {
      const u = new URL(text);
      const v = u.searchParams.get("sn") ?? u.searchParams.get("serial");
      if (v) out.serial = v;
    } catch {
      // not a valid address after all
    }
    return out;
  }

  // the whole code is a MAC address (12 hex digits, maybe with separators)
  const whole = text.match(new RegExp(`^${MAC_RE.source}$`, "i"));
  if (whole) {
    out.mac = formatMac(whole);
    // without separators it can also be a serial number made only of hex digits
    if (!/[:-]/.test(text)) out.serial = text.toUpperCase();
    return out;
  }
  if (/^[A-Z0-9][A-Z0-9_./-]{3,39}$/i.test(text)) out.serial = text;
  return out;
}
