/**
 * Reads the "Skill Finder" sheet of the catalogue workbook: the "Find my skills" questions.
 * One row per answer (4 per question). Round 1 questions have a text per career stage and point
 * to skill headings with weights ("Communication & Presenting: 2; Influence, Negotiation & Sales: 1").
 * Round 2 questions belong to one heading and point to topics ("Topic A; Topic B").
 * A blank "Points to" means the strong answer (no gap).
 */
import ExcelJS from 'exceljs';
import { DEFAULT_CATALOG, type CatalogHeading } from './catalog.js';

export type FinderAnswer = { key: string; text: string; points: { name: string; weight: number }[]; insight: string | null };
export type FinderQuestion = {
  id: string; round: 1 | 2; heading: string | null;
  text: { early_career: string; manager: string; senior_executive: string };
  answers: FinderAnswer[];
};
export type Finder = { round1: FinderQuestion[]; round2: FinderQuestion[] };

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v);
};

export async function loadFinder(catalog: CatalogHeading[], file = DEFAULT_CATALOG): Promise<Finder | null> {
  if (!/\.xlsx$/i.test(file)) return null;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Skill Finder');
  if (!ws) return null;
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => cellText(h).trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name)) + 1;
  const C = { round: col('round'), id: col('question id'), heading: col('heading'), early: col('question: early'), manager: col('question: manager'),
    senior: col('question: senior'), key: col('answer'), answer: col('answer text'), points: col('points to'), insight: col('insight') };
  if (Object.values(C).some((c) => c === 0)) throw new Error('Skill Finder sheet: missing a column (expected Round, Question ID, Heading, the three Question columns, Answer, Answer text, Points to, Insight)');

  const headings = new Set(catalog.map((h) => h.name));
  const topics = new Set(catalog.flatMap((h) => h.topics.map((t) => t.name)));
  const errors: string[] = [];
  const byId = new Map<string, FinderQuestion>();
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (c: number) => cellText(row.getCell(c).value).trim();
    const id = get(C.id);
    if (!id) return;
    const round = Number(get(C.round)) === 2 ? 2 : 1;
    let q = byId.get(id);
    if (!q) {
      const early = get(C.early);
      q = { id, round, heading: get(C.heading) || null, text: { early_career: early, manager: get(C.manager) || early, senior_executive: get(C.senior) || early }, answers: [] };
      if (!early) errors.push(`Row ${n}: question ${id} needs its text on the first answer row`);
      if (round === 2 && !headings.has(q.heading ?? '')) errors.push(`Row ${n}: heading "${q.heading}" is not in the catalogue`);
      byId.set(id, q);
    }
    const points = get(C.points).split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      if (round === 1) {
        const m = p.match(/^(.*?):\s*(\d+)$/);
        const name = (m ? m[1] : p).trim();
        if (!headings.has(name)) errors.push(`Row ${n}: heading "${name}" is not in the catalogue`);
        return { name, weight: m ? Number(m[2]) : 1 };
      }
      if (!topics.has(p)) errors.push(`Row ${n}: topic "${p}" is not in the catalogue`);
      return { name: p, weight: 1 };
    });
    q.answers.push({ key: get(C.key) || 'ABCD'[q.answers.length], text: get(C.answer), points, insight: get(C.insight) || null });
  });
  for (const q of byId.values()) if (q.answers.length < 2) errors.push(`Question ${q.id} needs at least 2 answers`);
  if (errors.length) throw new Error(`Skill Finder sheet has ${errors.length} problem(s):\n  ${errors.slice(0, 20).join('\n  ')}`);
  const all = [...byId.values()];
  return { round1: all.filter((q) => q.round === 1), round2: all.filter((q) => q.round === 2) };
}
