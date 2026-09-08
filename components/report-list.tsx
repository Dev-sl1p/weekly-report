'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
  CalendarDays,
  ArrowRight,
  PenLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { useApi } from './workspace';
import {
  weekStart,
  weekLabel,
  shiftWeek,
  timeLabel,
  type Report,
  type ReportList,
} from '@/lib/reports';
import { ClientError } from '@/lib/client-api';
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const auth = error instanceof ClientError && error.status === 401;
  return (
    <div className="error-box" role="alert">
      <p>{error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}</p>
      {auth ? (
        <a href="/login" className="text-primary underline">
          เข้าสู่ระบบอีกครั้ง
        </a>
      ) : (
        <Button variant="outline" onClick={retry}>
          ลองอีกครั้ง
        </Button>
      )}
    </div>
  );
}
export function LoadingRows() {
  return (
    <div className="space-y-4" aria-label="กำลังโหลดรายงาน" role="status">
      {[1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
function ReportRow({ report }: { report: Report }) {
  return (
    <a className="report-row" href={'/reports/' + report.id}>
      <div className="report-avatar">{report.authorName.slice(0, 1)}</div>
      <div className="report-row-main">
        <div className="report-row-heading">
          <h3>{report.authorName}</h3>
          <span className={'status-badge ' + report.status}>
            {report.status === 'draft' ? 'ฉบับร่าง' : 'ส่งแล้ว'}
          </span>
        </div>
        <p className="report-snippet">
          {report.completed ||
            report.inProgress ||
            report.blockers ||
            report.nextWeek ||
            'ยังไม่ได้กรอกเนื้อหา'}
        </p>
        <div className="report-meta">
          <span>
            <CalendarDays size={13} />
            {weekLabel(report.weekStart)}
          </span>
          <span>แก้ไข {timeLabel(report.updatedAt)}</span>
        </div>
      </div>
      <ArrowUpRight size={20} className="muted shrink-0" />
    </a>
  );
}
export function ReportListView({ archive = false }: { archive?: boolean }) {
  const params = useSearchParams(),
    api = useApi();
  const [week, setWeek] = useState(() => {
      try {
        return params.get('week')
          ? weekStart(params.get('week')!)
          : archive
            ? ''
            : weekStart();
      } catch {
        return archive ? '' : weekStart();
      }
    }),
    [author, setAuthor] = useState('all'),
    [scope, setScope] = useState('team'),
    [page, setPage] = useState(1);
  const queryParams = new URLSearchParams({ scope, page: String(page) });
  if (week) queryParams.set('week', week);
  if (author !== 'all') queryParams.set('author', author);
  const query = useQuery({
    queryKey: ['reports', scope, week, author, page],
    queryFn: () => api<ReportList>('reports?' + queryParams),
  });
  const authors = useQuery({
    queryKey: ['authors'],
    queryFn: () => api<{ authors: { id: string; name: string }[] }>('authors'),
  });
  const own = useQuery({
    queryKey: ['own-summary', week],
    queryFn: () => api<ReportList>('reports?scope=mine&week=' + week),
    enabled: !archive && !!week,
  });
  function changeWeek(value: string) {
    setWeek(value ? weekStart(value) : '');
    setPage(1);
  }
  const currentOwn = own.data?.reports[0],
    writeLink = '/write' + (week ? '?week=' + week : '');
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {archive ? 'REPORT ARCHIVE' : 'THIS WEEK'}
          </span>
          <h1>{archive ? 'รายงานย้อนหลัง' : 'สัปดาห์นี้ของทีม'}</h1>
          <p className="muted">
            {archive
              ? 'กลับมาอ่านสิ่งที่ทีมทำในแต่ละสัปดาห์'
              : 'ความคืบหน้า ปัญหา และก้าวต่อไปของทุกคน'}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<a href={writeLink} />}
          className="primary-action"
        >
          <Plus size={18} />
          {currentOwn ? 'แก้ไขรายงานของฉัน' : 'เขียนรายงาน'}
        </Button>
      </div>
      {!archive && (
        <div className="my-report-banner">
          <div className="my-report-icon">
            <PenLine size={22} />
          </div>
          <div className="flex-1">
            <h2>
              {currentOwn?.status === 'submitted'
                ? 'ส่งรายงานของคุณแล้ว'
                : currentOwn
                  ? 'รายงานของคุณยังเป็นฉบับร่าง'
                  : 'พร้อมบันทึกสัปดาห์นี้หรือยัง?'}
            </h2>
            <p>
              {currentOwn?.status === 'submitted'
                ? 'ทีมเปิดอ่านได้แล้ว คุณยังแก้ไขเนื้อหาได้'
                : currentOwn
                  ? 'ฉบับร่างนี้ยังมีเพียงคุณที่อ่านได้'
                  : 'ใช้ 4 หัวข้อสั้น ๆ ช่วยให้ทีมเห็นความคืบหน้าไปด้วยกัน'}
            </p>
          </div>
          <a href={writeLink} className="banner-link">
            {currentOwn ? 'เปิดรายงาน' : 'เริ่มเขียน'}
            <ArrowRight size={17} />
          </a>
        </div>
      )}
      <section className="reports-panel">
        <div className="reports-toolbar">
          <Tabs
            value={scope}
            onValueChange={(value) => {
              setScope(String(value));
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="team">รายงานของทีม</TabsTrigger>
              <TabsTrigger value="mine">รายงานของฉัน</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="small muted">
            {query.data ? query.data.total + ' รายงาน' : ''}
          </span>
        </div>
        <div className="filters">
          <div className="week-controls">
            {!archive && (
              <Button
                variant="outline"
                size="icon"
                aria-label="สัปดาห์ก่อนหน้า"
                onClick={() => changeWeek(shiftWeek(week, -1))}
              >
                <ChevronLeft />
              </Button>
            )}
            <label className="filter-field">
              <span>{archive ? 'เลือกวันที่ในสัปดาห์' : 'สัปดาห์ของวันที่'}</span>
              <Input
                type="date"
                value={week}
                onChange={(e) => {
                  try {
                    changeWeek(e.target.value);
                  } catch {}
                }}
              />
            </label>
            {!archive && (
              <Button
                variant="outline"
                size="icon"
                aria-label="สัปดาห์ถัดไป"
                onClick={() => changeWeek(shiftWeek(week, 1))}
              >
                <ChevronRight />
              </Button>
            )}
          </div>
          <label className="filter-field author-filter">
            <span>ผู้เขียน</span>
            <Select
              value={author}
              onValueChange={(value) => {
                setAuthor(value || 'all');
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="กรองผู้เขียน">
                <SelectValue>
                  {author === 'all'
                    ? 'ทุกคน'
                    : authors.data?.authors.find((a) => a.id === author)
                        ?.name || 'ผู้เขียน'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกคน</SelectItem>
                {authors.data?.authors.map((a) => (
                  <SelectItem value={a.id} key={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {archive && week && (
            <Button variant="ghost" onClick={() => changeWeek('')}>
              ทุกสัปดาห์
            </Button>
          )}
          {!archive && week !== weekStart() && (
            <Button variant="ghost" onClick={() => changeWeek(weekStart())}>
              สัปดาห์ปัจจุบัน
            </Button>
          )}
        </div>
        {week && (
          <div className="selected-week">
            <CalendarDays size={16} />
            {weekLabel(week)}
          </div>
        )}
        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : query.data.reports.length ? (
          <div>
            {query.data.reports.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </div>
        ) : (
          <Empty className="report-empty">
            <EmptyHeader>
              <span className="empty-icon">
                <FileText size={28} />
              </span>
              <EmptyTitle>ยังไม่มีรายงาน{week ? 'ในสัปดาห์นี้' : ''}</EmptyTitle>
              <EmptyDescription>
                {scope === 'team'
                  ? 'รายงานจะปรากฏที่นี่เมื่อสมาชิกกดส่ง'
                  : 'เริ่มเขียนและบันทึกรายงานของคุณได้เลย'}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={writeLink} />}
            >
              เขียนรายงาน
            </Button>
          </Empty>
        )}
        {query.data && query.data.total > 20 && (
          <Pagination className="pagination-bar" aria-label="หน้ารายงาน">
            <PaginationContent>
              <PaginationItem>
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft />
                  ก่อนหน้า
                </Button>
              </PaginationItem>
              <PaginationItem>
                <span className="small px-4">
                  {page} / {Math.ceil(query.data.total / 20)}
                </span>
              </PaginationItem>
              <PaginationItem>
                <Button
                  variant="outline"
                  disabled={page * 20 >= query.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ถัดไป
                  <ChevronRight />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </section>
    </div>
  );
}
