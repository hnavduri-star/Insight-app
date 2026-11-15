/**
 * Reads the topic catalogue (default: data/insight-topics-and-books.xlsx at the repo root).
 * One row per book, either as .xlsx or .csv:
 *   heading, heading_icon, topic, scope, book_title, author, book_type, buy_url
 * - heading_icon is optional (emoji); only the first row of a heading needs it.
 * - scope is a one-line description of the topic; only one row of a topic needs it.
 * - book_type is "fiction" or "non-fiction" (blank = non-fiction).
 * - Row order sets display order of headings, topics and books.
 * Also reads .xlsx directly (sheet "Topics and Books", or the first sheet).
 */
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export type CatalogBook = { title: string; author: string | null; kind: 'fiction' | 'nonfiction'; buyUrl: string | null };
export type CatalogTopic = { name: string; description: string | null; featured?: boolean; books: CatalogBook[] };
export type CatalogHeading = { name: string; icon: string; topics: CatalogTopic[] };

export const DEFAULT_CATALOG = new URL('../../../data/insight-topics-and-books.xlsx', import.meta.url).pathname;

const norm = (s: string) => s.trim().toLowerCase().replace(/['’]/g, '').replace(/[\s_]+/g, '_');

/** Reads a .csv or .xlsx catalogue. */
export async function loadCatalog(file = DEFAULT_CATALOG): Promise<CatalogHeading[]> {
  if (!/\.xlsx$/i.test(file)) return readCatalog(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Topics and Books') ?? wb.worksheets[0];
  const text = (v: ExcelJS.CellValue): string => {
    if (v == null) return '';
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return String(v.text);           // hyperlink
      if ('result' in v) return String(v.result ?? ''); // formula
    }
    return String(v);
  };
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => norm(text(h)));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, string> = {};
    header.forEach((h, c) => { r[h] = text(row.getCell(c + 1).value).trim(); });
    rows.push(r);
  });
  return buildCatalog(rows);
}

export function readCatalog(file = DEFAULT_CATALOG): CatalogHeading[] {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows: Record<string, string>[] = parse(raw, {
    columns: (h: string[]) => h.map(norm), skip_empty_lines: true, trim: true, relax_column_count: true,
  });
  return buildCatalog(rows);
}

function buildCatalog(rows: Record<string, string>[]): CatalogHeading[] {
  const errors: string[] = [];
  const headings = new Map<string, CatalogHeading>();
  const topicHeading = new Map<string, string>();

  rows.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const heading = r.heading ?? r.category ?? '';
    const topic = r.topic ?? '';
    const title = r.book_title ?? r.book ?? r.title ?? '';
    if (!heading && !topic && !title) return;
    if (!heading || !topic || !title) { errors.push(`Line ${line}: heading, topic and book_title are required`); return; }
    const type = norm(r.book_type ?? r.type ?? '');
    if (type && !['fiction', 'non_fiction', 'nonfiction', 'non-fiction'].includes(type)) {
      errors.push(`Line ${line}: book_type must be "fiction" or "non-fiction" (got "${r.book_type}")`); return;
    }
    const prev = topicHeading.get(topic.toLowerCase());
    if (prev && prev !== heading) { errors.push(`Line ${line}: topic "${topic}" is under both "${prev}" and "${heading}"; topics must not overlap`); return; }
    topicHeading.set(topic.toLowerCase(), heading);

    let h = headings.get(heading);
    if (!h) headings.set(heading, (h = { name: heading, icon: '', topics: [] }));
    if (!h.icon && r.heading_icon) h.icon = r.heading_icon;
    let t = h.topics.find((x) => x.name.toLowerCase() === topic.toLowerCase());
    if (!t) h.topics.push((t = { name: topic, description: null, featured: false, books: [] }));
    if (/^(y|yes|true|1|x)$/i.test(r.editor_pick ?? r.editors_pick ?? r.featured ?? '')) t.featured = true;
    if (!t.description && (r.scope || r.description)) t.description = r.scope || r.description;
    if (t.books.some((b) => b.title.toLowerCase() === title.toLowerCase())) return;
    t.books.push({ title, author: r.author || null, kind: type === 'fiction' ? 'fiction' : 'nonfiction', buyUrl: r.buy_url || null });
  });

  if (errors.length) throw new Error(`Catalogue has ${errors.length} problem(s):\n  ${errors.slice(0, 20).join('\n  ')}`);
  if (!headings.size) throw new Error('Catalogue is empty');
  for (const h of headings.values()) if (!h.icon) h.icon = '📚';
  return [...headings.values()];
}
