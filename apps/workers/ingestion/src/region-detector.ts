const COUNTRY_REGIONS: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US', 'america': 'US',
  'canada': 'CA', 'mexico': 'MX',

  'united kingdom': 'GB', 'britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES', 'portugal': 'PT',
  'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
  'poland': 'PL', 'ukraine': 'UA', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
  'greece': 'GR', 'ireland': 'IE', 'czech republic': 'CZ', 'romania': 'RO', 'hungary': 'HU',

  'china': 'CN', 'japan': 'JP', 'india': 'IN', 'south korea': 'KR', 'north korea': 'KP',
  'taiwan': 'TW', 'indonesia': 'ID', 'philippines': 'PH', 'vietnam': 'VN', 'thailand': 'TH',
  'malaysia': 'MY', 'singapore': 'SG', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK',

  'israel': 'IL', 'iran': 'IR', 'iraq': 'IQ', 'saudi arabia': 'SA', 'turkey': 'TR',
  'syria': 'SY', 'lebanon': 'LB', 'jordan': 'JO', 'yemen': 'YE', 'qatar': 'QA', 'uae': 'AE',

  'egypt': 'EG', 'south africa': 'ZA', 'nigeria': 'NG', 'kenya': 'KE', 'ethiopia': 'ET',
  'morocco': 'MA', 'algeria': 'DZ', 'tunisia': 'TN', 'ghana': 'GH', 'sudan': 'SD',

  'brazil': 'BR', 'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL', 'peru': 'PE', 'venezuela': 'VE',

  'australia': 'AU', 'new zealand': 'NZ',

  'russia': 'RU', 'moscow': 'RU', 'kremlin': 'RU',
};

const SORTED_ENTRIES = Object.entries(COUNTRY_REGIONS).sort(
  (a, b) => b[0].length - a[0].length,
);

export function detectRegion(title: string): string | null {
  const lower = title.toLowerCase();

  for (const [name, code] of SORTED_ENTRIES) {
    if (lower.includes(name)) {
      return code;
    }
  }

  return null;
}
