// Region is inferred from each backend's IP, per site addressing:
//   CCC -> 10.165.x.x
//   LMC -> 10.144.x.x
// Anything else lands in "Other" so pre-existing/lab appliances (e.g. the
// 172.23.191.x UAT boxes) stay reachable instead of silently vanishing from
// every region tab.

export const CCC = 'CCC';
export const LMC = 'LMC';
export const OTHER = 'Other';

const PREFIXES = [
  { region: CCC, test: /^10\.165\./ },
  { region: LMC, test: /^10\.144\./ },
];

export function regionForHost(host = '') {
  const ip = String(host)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0];
  for (const { region, test } of PREFIXES) {
    if (test.test(ip)) return region;
  }
  return OTHER;
}

export function regionForBackend(backend) {
  return regionForHost(backend?.host);
}

// "Which region does this install live in?" — the most common known region
// among configured backends. Null when nothing identifiable is configured.
export function detectHomeRegion(backends) {
  const counts = new Map();
  backends.forEach((b) => {
    const r = regionForBackend(b);
    if (r === OTHER) return;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  });
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// CCC and LMC are always offered; Other only appears when something needs it.
export function availableRegions(backends) {
  const regions = [CCC, LMC];
  if (backends.some((b) => regionForBackend(b) === OTHER)) regions.push(OTHER);
  return regions;
}
