export const sections = [
  {
    key: 'completed',
    title: 'งานที่เสร็จ',
    hint: 'งานหรือผลลัพธ์ที่ทำสำเร็จในสัปดาห์นี้',
    number: '01',
  },
  {
    key: 'inProgress',
    title: 'งานที่กำลังทำ',
    hint: 'งานที่กำลังเดินหน้า และความคืบหน้าล่าสุด',
    number: '02',
  },
  {
    key: 'blockers',
    title: 'ปัญหา / ความช่วยเหลือ',
    hint: 'อุปสรรค หรือสิ่งที่อยากให้ทีมช่วย',
    number: '03',
  },
  {
    key: 'nextWeek',
    title: 'แผนสัปดาห์หน้า',
    hint: 'งานที่ตั้งใจทำ และลำดับความสำคัญ',
    number: '04',
  },
] as const;
export type SectionKey = (typeof sections)[number]['key'];
export type ReportContent = Record<SectionKey, string>;
export type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
};
export type Report = ReportContent & {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  weekStart: string;
  status: 'draft' | 'submitted';
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};
export type ReportList = {
  reports: Report[];
  total: number;
  page: number;
  pageSize: number;
};
export type Member = {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
  role: 'admin' | 'member';
  active: number;
  createdAt: string;
};
export const blankContent: ReportContent = {
  completed: '',
  inProgress: '',
  blockers: '',
  nextWeek: '',
};
export function bangkokDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
export function weekStart(date = bangkokDate()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  const d = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw new Error('วันที่ไม่ถูกต้อง');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function shiftWeek(date: string, offset: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset * 7);
  return d.toISOString().slice(0, 10);
}
export function weekLabel(date: string): string {
  const first = new Date(date + 'T00:00:00Z'),
    last = new Date(first);
  last.setUTCDate(first.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return fmt.format(first) + ' – ' + fmt.format(last);
}
export function timeLabel(date: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(date));
}
