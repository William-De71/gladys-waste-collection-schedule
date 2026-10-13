// Widget contents for the generated illustrations, built by the real code of
// the integration (buildUpcomingWidget, drawBin) on made-up but plausible
// data: a fixed day (Thursday 15 October 2026) and two schedules. Written as
// JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { buildUpcomingWidget } = await load('src/widgets.js');
const { drawBin } = await load('src/bins.js');
const { cleanCollections } = await load('src/schedule.js');
const { LANGUAGES } = await load('src/i18n.js');

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const today = '2026-10-15';
const customize = { renames: new Map(), hidden: new Set() };

// Typical French collections: household waste twice a week, sorting and
// glass every other week, green waste in season.
const home = [
  ['2026-10-16', 'Tri sélectif', 'mdi:recycle'],
  ['2026-10-16', 'Ordures ménagères', 'mdi:trash-can'],
  ['2026-10-19', 'Ordures ménagères', 'mdi:trash-can'],
  ['2026-10-21', 'Déchets verts', 'mdi:leaf'],
  ['2026-10-23', 'Ordures ménagères', 'mdi:trash-can'],
  ['2026-10-26', 'Verre', 'mdi:bottle-wine'],
  ['2026-10-30', 'Tri sélectif', 'mdi:recycle'],
].map(([date, type, icon]) => ({ date, type, icon }));
const cottage = [
  ['2026-10-15', 'Restmüll', null],
  ['2026-10-22', 'Papier', null],
  ['2026-10-29', 'Gelbe Tonne', null],
].map(([date, type, icon]) => ({ date, type, icon }));

const names = {
  home: { en: 'Home', fr: 'Maison', de: 'Zuhause', es: 'Casa' },
  cottage: { en: 'Cottage', fr: 'Chalet', de: 'Hütte', es: 'Cabaña' },
};
const schedules = [
  {
    slot: '1',
    name: names.home,
    collections: cleanCollections(home, customize, today),
    error: null,
    fetchedAt: 1,
  },
  {
    slot: '2',
    name: names.cottage,
    collections: cleanCollections(cottage, customize, today),
    error: null,
    fetchedAt: 1,
  },
];

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    home: buildUpcomingWidget({ schedules: [schedules[0]], today, settings: {} }),
    all: buildUpcomingWidget({ schedules, today, settings: { count: '5' } }),
  };
}

const images = {};
for (const content of Object.values(contents.en)) {
  for (const component of content.components) {
    for (const item of component.items ?? []) {
      const family = item.image?.replace(/^bin-v\d+-/, '');
      if (family && !images[item.image]) {
        images[item.image] = `data:image/png;base64,${drawBin(family)}`;
      }
    }
  }
}

const [widget] = manifest.widgets;
writeFileSync(
  out,
  JSON.stringify({
    contents,
    images,
    cards: {
      home: { icon: widget.icon, label: widget.label },
      all: { icon: widget.icon, label: widget.label },
    },
  }),
);
