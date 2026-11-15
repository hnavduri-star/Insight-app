/**
 * Reads the topic catalogue from a CSV (default: data/topics.csv at the repo root).
 * One row per book:
 *   heading, heading_icon, topic, book_title, author, book_type, buy_url
 * - heading_icon is optional (emoji); only the first row of a heading needs it.
 * - book_type is "fiction" or "non-fiction" (blank = non-fiction).
 * - Row order sets display order of headings, topics and books.
 * Excel: File > Save As > CSV UTF-8.
 */
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

export type CatalogBook = { title: string; author: string | null; kind: 'fiction' | 'nonfiction'; buyUrl: string | null };
export type CatalogTopic = { name: string; books: CatalogBook[] };
export type CatalogHeading = { name: string; icon: string; topics: CatalogTopic[] };

export const DEFAULT_CATALOG = new URL('../../../data/topics.csv', import.meta.url).pathname;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '_');

export function readCatalog(file = DEFAULT_CATALOG): CatalogHeading[] {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows: Record<string, string>[] = parse(raw, {
    columns: (h: string[]) => h.map(norm), skip_empty_lines: true, trim: true, relax_column_count: true,
  });
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
    if (!t) h.topics.push((t = { name: topic, books: [] }));
    if (t.books.some((b) => b.title.toLowerCase() === title.toLowerCase())) return;
    t.books.push({ title, author: r.author || null, kind: type === 'fiction' ? 'fiction' : 'nonfiction', buyUrl: r.buy_url || null });
  });

  if (errors.length) throw new Error(`Catalogue has ${errors.length} problem(s):\n  ${errors.slice(0, 20).join('\n  ')}`);
  if (!headings.size) throw new Error('Catalogue is empty');
  for (const h of headings.values()) if (!h.icon) h.icon = '📚';
  return [...headings.values()];
}
