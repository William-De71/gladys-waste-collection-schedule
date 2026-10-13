// -----------------------------------------------------------------------------
// Bin colors: a waste type -> a family (recycling, paper, glass, organic…),
// a semantic widget color and a bin pictogram.
//
// The family comes from the Material Design icon a source gives
// (`mdi:recycle`…), else from words of the type in the languages of the
// sources. It only picks a color: a wrong guess shows a grey bin, nothing
// else depends on it.
//
// Pictograms are drawn here (pngjs, no native binary): a wheelie bin of the
// family color, 96 x 96, anti-aliased by 4x supersampling. The image key
// carries the drawing version and the family, so the 1 h cache of Gladys
// never serves an old drawing.
// -----------------------------------------------------------------------------

import { PNG } from 'pngjs';

const DRAWING_VERSION = 1;

export const FAMILIES = {
  recycling: { color: 'warning', rgb: [242, 192, 31] },
  paper: { color: 'info', rgb: [41, 121, 214] },
  glass: { color: 'success', rgb: [32, 150, 120] },
  organic: { color: 'success', rgb: [133, 91, 52] },
  garden: { color: 'success', rgb: [76, 161, 60] },
  residual: { color: 'neutral', rgb: [96, 104, 112] },
  hazardous: { color: 'danger', rgb: [205, 50, 50] },
  bulky: { color: 'warning', rgb: [232, 120, 30] },
  textile: { color: 'primary', rgb: [128, 82, 190] },
  other: { color: 'neutral', rgb: [150, 156, 162] },
};

// Material Design icons used by the sources (icons.py of the library).
const ICONS = [
  [/recycle|bottle-soda-classic|package/, 'recycling'],
  [/newspaper|paper|file-document/, 'paper'],
  [/bottle-wine|glass|bottle-soda(?!-classic)/, 'glass'],
  [/leaf|food|compost|sprout/, 'organic'],
  [/flower|tree|grass/, 'garden'],
  [/biohazard|chemical|battery|radioactive|flask/, 'hazardous'],
  [/sofa|truck|dump-truck|washing-machine/, 'bulky'],
  [/tshirt|hanger/, 'textile'],
  [/trash|delete/, 'residual'],
];

// Words, accents removed, in the languages of the sources.
const WORDS = [
  [
    /sapin|christbaum|weihnachtsbaum|christmas tree|tannenbaum|kerstboom|arbol de navidad/,
    'garden',
  ],
  [/encombrant|sperr|bulky|voluminos|grof|grov|ingombrant|objets? volumineux/, 'bulky'],
  [/textil|vetement|kleider|clothes|clothing|ropa/, 'textile'],
  [
    /dangereu|schadstoff|sonderm|gefahr|hazard|problem|chemi|toxique|peligros|kca|batter/,
    'hazardous',
  ],
  [/verre|glas|glass|vidrio|vetro|sklo|szklo|lasi|stikla/, 'glass'],
  [/papier|paper|papel|carta|karton|pappe|carton|cardboard|papir|papp/, 'paper'],
  [
    /recycl|emballage|tri selectif|tri |gelb|verpack|wertstoff|plast|envase|pmd|lvp|packaging|commingled|jaune|dsd|metal|plasty|kunststoff/,
    'recycling',
  ],
  [/vegeta|dechets? verts|garden|jardin|grun|gruen|green waste|tuin|yard|hage|grass/, 'garden'],
  [
    /bio|organi|compost|food|alimentaire|kitchen|gft|biomull|dechets? de cuisine|organico|matiere organique/,
    'organic',
  ],
  [
    /ordure|rest|residu|household|general|landfill|refuse|rubbish|trash|menager|hausmull|grise|black bin|grey|gray|mixed|smesny|smeci|indifferenziato|om\b/,
    'residual',
  ],
];

/**
 * @description The family of a waste type.
 * @param {string} type - The waste type.
 * @param {string|null} [icon] - The icon the source gave (`mdi:…`).
 * @returns {string} A key of FAMILIES.
 */
export function familyOf(type, icon) {
  const words = ` ${String(type ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()} `;
  for (const [pattern, family] of WORDS) {
    if (pattern.test(words)) {
      return family;
    }
  }
  const name = String(icon ?? '').replace(/^mdi:/, '');
  if (name) {
    for (const [pattern, family] of ICONS) {
      if (pattern.test(name)) {
        return family;
      }
    }
  }
  return 'other';
}

/**
 * @description The widget image key of a family.
 * @param {string} family - A key of FAMILIES.
 * @returns {string} `bin-v<n>-<family>`.
 */
export function binImageKey(family) {
  return `bin-v${DRAWING_VERSION}-${FAMILIES[family] ? family : 'other'}`;
}

/**
 * @description The family of an image key, null for a key that is not a bin.
 * @param {string} key - Image key.
 * @returns {string|null} The family.
 */
export function familyOfImageKey(key) {
  const match = /^bin-v(\d+)-([a-z]+)$/.exec(String(key));
  if (!match || Number(match[1]) !== DRAWING_VERSION || !FAMILIES[match[2]]) {
    return null;
  }
  return match[2];
}

const SIZE = 96;
const SCALE = 4;

/**
 * @description Whether a point of the large canvas is inside the bin shape.
 * @param {number} x - Abscissa, in units of the 96 px grid.
 * @param {number} y - Ordinate.
 * @returns {string|null} 'body', 'lid', 'dark' (wheels, handle, grooves) or null.
 */
function shapeAt(x, y) {
  const inCircle = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  // Wheels.
  if (inCircle(30, 83, 7) || inCircle(66, 83, 7)) {
    return inCircle(30, 83, 3) || inCircle(66, 83, 3) ? 'body' : 'dark';
  }
  // Handle above the lid.
  if (y >= 13 && y <= 18 && x >= 36 && x <= 60) {
    return y <= 15 || x <= 39 || x >= 57 ? 'dark' : null;
  }
  // Lid.
  if (y >= 18 && y <= 27 && x >= 14 && x <= 82) {
    return 'lid';
  }
  // Body: a trapezoid narrower at the bottom.
  if (y > 27 && y <= 80) {
    const inset = ((y - 27) / 53) * 8;
    if (x >= 20 + inset && x <= 76 - inset) {
      const groove = [36, 48, 60].some((gx) => Math.abs(x - gx) < 1.6) && y > 36 && y < 72;
      return groove ? 'dark' : 'body';
    }
  }
  return null;
}

/**
 * @description Draw the bin of a family.
 * @param {string} family - A key of FAMILIES.
 * @returns {string} Raw base64 PNG (no `data:` prefix).
 */
export function drawBin(family) {
  const [r, g, b] = (FAMILIES[family] ?? FAMILIES.other).rgb;
  const shade = (factor) => [r, g, b].map((value) => Math.round(value * factor));
  const colors = { body: [r, g, b], lid: shade(0.78), dark: [55, 60, 66] };
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      const sum = [0, 0, 0];
      let hits = 0;
      for (let sy = 0; sy < SCALE; sy += 1) {
        for (let sx = 0; sx < SCALE; sx += 1) {
          const part = shapeAt(px + (sx + 0.5) / SCALE, py + (sy + 0.5) / SCALE);
          if (part) {
            hits += 1;
            colors[part].forEach((value, index) => {
              sum[index] += value;
            });
          }
        }
      }
      const offset = (py * SIZE + px) * 4;
      if (hits === 0) {
        png.data[offset + 3] = 0;
        continue;
      }
      png.data[offset] = Math.round(sum[0] / hits);
      png.data[offset + 1] = Math.round(sum[1] / hits);
      png.data[offset + 2] = Math.round(sum[2] / hits);
      png.data[offset + 3] = Math.round((hits / (SCALE * SCALE)) * 255);
    }
  }
  return PNG.sync.write(png).toString('base64');
}
