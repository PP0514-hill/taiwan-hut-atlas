import hutsRaw from '../../data/huts.json';
import eventsRaw from '../../data/events.json';
import sourcesRaw from '../../data/sources.json';
import agencies from '../../data/agencies.json';
import trails from '../../data/trails.json';
import meta from '../../data/meta.json';

export type Hut = (typeof hutsRaw)[number];
export type HutEvent = (typeof eventsRaw)[number];
export type Source = (typeof sourcesRaw)[number];

/** published：只輸出已覆核（正式站）；draft：含 AI 初稿（開發預覽，頁面會掛提示） */
export const PUBLISH_MODE = (import.meta.env.PUBLISH_MODE ?? process.env.PUBLISH_MODE ?? 'draft') as 'published' | 'draft';
export const IS_DRAFT = PUBLISH_MODE === 'draft';

const allowed = (review: string | null) => IS_DRAFT ? review !== '退回修正' : review === '已覆核';

export const huts: Hut[] = (hutsRaw as Hut[]).filter((h) => allowed(h.review));
const hutIds = new Set(huts.map((h) => h.id));
export const events: HutEvent[] = (eventsRaw as HutEvent[]).filter((e) => hutIds.has(e.hut) && allowed(e.review));
export const sources: Source[] = (sourcesRaw as Source[]).filter((s) => s.huts.some((id) => hutIds.has(id)));
export const sourceById = Object.fromEntries(sources.map((s) => [s.id, s]));
export { agencies, trails, meta };

/** 「關聯設施」不計入山屋統計 */
export const countable = huts.filter((h) => h.type !== '關聯設施');
export const active = countable.filter((h) => ['使用中', '整修中'].includes(h.status ?? ''));

export const TYPE_ORDER = ['服務型山屋', '避難型山屋', '民營山莊', '工寮', '獵寮', '駐在所或日治遺構', '已停用', '已拆除', '關聯設施'];
export const GRADE_LABEL: Record<string, string> = { 'A 現勘': 'A', 'B 官方或學術': 'B', 'C 二手彙整': 'C', 'D 僅知存在': 'D' };

export const fmt = (n: number | null | undefined, unit = '') => (n == null ? '—' : `${n.toLocaleString('zh-Hant-TW')}${unit}`);

/** 公開版 GeoJSON（由 huts.json 的降階座標組成，與 data/huts.public.geojson 等價） */
export const geo = {
  type: 'FeatureCollection' as const,
  features: huts.filter((h) => h.lon != null && h.lat != null).map((h) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [h.lon as number, h.lat as number] },
    properties: { id: h.id, slug: h.slug, name: h.name, name_en: h.name_en, type: h.type, status: h.status, region: h.region, beds: h.beds, elev_m: h.elev_m, logistics_index: h.logistics_index, grade: h.grade, first_built_year: h.first_built_year, coord_precision: h.coord_precision, coord_rule: h.coord_rule },
  })),
};
