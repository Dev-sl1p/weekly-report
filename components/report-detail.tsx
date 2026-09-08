'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PenLine, CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sections, weekLabel, timeLabel, type Report } from '@/lib/reports';
import { useApi, useAuth } from './workspace';
import { ErrorState, LoadingRows } from './report-list';
export function ReportDetail({ id }: { id: string }) {
  const api = useApi(),
    { user } = useAuth(),
    query = useQuery({
      queryKey: ['report', id],
      queryFn: () =>
        api<{ report: Report }>('reports/' + encodeURIComponent(id)),
    });
  if (query.isPending) return <LoadingRows />;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const r = query.data.report;
  return (
    <div className="reading-width">
      <a href="/reports" className="back-link">
        <ArrowLeft size={17} />
        รายงานย้อนหลัง
      </a>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WEEKLY REPORT</span>
          <h1>รายงานของ {r.authorName}</h1>
        </div>
        {r.authorId === user.id && (
          <Button
            nativeButton={false}
            render={<a href={'/write?week=' + r.weekStart} />}
            variant="outline"
          >
            <PenLine />
            แก้ไขรายงาน
          </Button>
        )}
      </div>
      <div className="detail-meta">
        <span>
          <CalendarDays size={16} />
          {weekLabel(r.weekStart)}
        </span>
        <span className={'status-badge ' + r.status}>
          {r.status === 'draft' ? 'ฉบับร่าง · เฉพาะคุณ' : 'ส่งแล้ว'}
        </span>
      </div>
      <article className="report-paper">
        {sections.map((s) => (
          <section className="reading-section" key={s.key}>
            <span className="section-number">{s.number}</span>
            <div>
              <h2>{s.title}</h2>
              <p className={r[s.key] ? 'report-text' : 'muted'}>
                {r[s.key] || 'ไม่ได้ระบุ'}
              </p>
            </div>
          </section>
        ))}
        <footer className="paper-footer">
          <Clock size={14} />
          แก้ไขล่าสุด {timeLabel(r.updatedAt)}
        </footer>
      </article>
    </div>
  );
}
