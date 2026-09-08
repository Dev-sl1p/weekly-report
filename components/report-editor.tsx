'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Send,
  LockKeyhole,
  CheckCircle2,
  CalendarDays,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useAuth, useApi } from './workspace';
import { ErrorState, LoadingRows } from './report-list';
import {
  blankContent,
  sections,
  weekStart,
  weekLabel,
  timeLabel,
  type Report,
  type ReportContent,
  type ReportList,
} from '@/lib/reports';
import { saveReport, ClientError } from '@/lib/client-api';
function extract(report: Report | null): ReportContent {
  return report
    ? (Object.fromEntries(
        sections.map((s) => [s.key, report[s.key]]),
      ) as ReportContent)
    : { ...blankContent };
}
export function ReportEditorPage() {
  const params = useSearchParams(),
    api = useApi();
  let week: string;
  try {
    week = weekStart(params.get('week') || undefined);
  } catch {
    return (
      <div className="error-box" role="alert">
        วันที่ไม่ถูกต้อง{' '}
        <a href="/write" className="underline">
          เขียนรายงานสัปดาห์นี้
        </a>
      </div>
    );
  }
  return <EditorLoader week={week} api={api} />;
}
function EditorLoader({
  week,
  api,
}: {
  week: string;
  api: ReturnType<typeof useApi>;
}) {
  const query = useQuery({
    queryKey: ['own-report', week],
    queryFn: () => api<ReportList>('reports?scope=mine&week=' + week),
  });
  if (query.isPending) return <LoadingRows />;
  if (query.isError && !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <Editor
      key={week}
      initialReport={query.data.reports[0] || null}
      week={week}
    />
  );
}
function Editor({
  initialReport,
  week,
}: {
  initialReport: Report | null;
  week: string;
}) {
  const { csrfToken, user } = useAuth(),
    api = useApi(),
    client = useQueryClient();
  const [report, setReport] = useState(initialReport),
    [fields, setFields] = useState(() => extract(initialReport)),
    [savedFields, setSavedFields] = useState(() => extract(initialReport)),
    [savedMessage, setSavedMessage] = useState(''),
    [reloadOpen, setReloadOpen] = useState(false),
    [reloading, setReloading] = useState(false),
    [reloadError, setReloadError] = useState('');
  const dirty = sections.some((s) => fields[s.key] !== savedFields[s.key]);
  const mutation = useMutation({
    mutationFn: (status: 'draft' | 'submitted') =>
      saveReport(
        csrfToken,
        {
          ...fields,
          weekStart: week,
          status,
          ...(report ? { id: report.id, version: report.version } : {}),
        },
        user.id,
      ),
    onSuccess: async (saved) => {
      accept(saved);
      setSavedMessage(
        saved.status === 'draft'
          ? 'บันทึกฉบับร่างแล้ว'
          : 'บันทึกแล้ว สมาชิกในทีมอ่านรายงานนี้ได้',
      );
      await client.invalidateQueries();
    },
  });
  function accept(saved: Report) {
    setReport(saved);
    setFields(extract(saved));
    setSavedFields(extract(saved));
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const onSave = (event: Event) => {
      const saved = (event as CustomEvent<Report>).detail;
      if (saved.authorId === user.id && saved.weekStart === week) {
        accept(saved);
        setSavedMessage('อัปเดตรายงานแล้ว');
        mutation.reset();
      }
    };
    window.addEventListener('weekly-report:saved', onSave);
    return () => window.removeEventListener('weekly-report:saved', onSave);
  }, [week, user.id]);
  async function reload() {
    setReloading(true);
    setReloadError('');
    try {
      const data = await api<ReportList>('reports?scope=mine&week=' + week);
      const latest = data.reports[0] || null;
      setReport(latest);
      setFields(extract(latest));
      setSavedFields(extract(latest));
      setSavedMessage('โหลดฉบับล่าสุดแล้ว');
      mutation.reset();
      setReloadOpen(false);
    } catch (e) {
      setReloadError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setReloading(false);
    }
  }
  const conflict =
    mutation.error instanceof ClientError &&
    ['version_conflict', 'duplicate_week'].includes(mutation.error.code);
  return (
    <div className="editor-width">
      <a href="/" className="back-link">
        <ArrowLeft size={17} />
        กลับไปสัปดาห์นี้
      </a>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WEEKLY REPORT</span>
          <h1>{report ? 'รายงานของฉัน' : 'เขียนรายงาน'}</h1>
          <p className="muted">บันทึกสัปดาห์ของคุณ ผ่าน 4 หัวข้อ</p>
        </div>
        <span className={'status-badge ' + (report?.status || 'draft')}>
          {report?.status === 'submitted' ? 'ส่งแล้ว' : 'ฉบับร่าง · เฉพาะคุณ'}
        </span>
      </div>
      <div className="editor-week">
        <CalendarDays size={22} />
        <div className="flex-1">
          <label htmlFor="report-week" className="small muted">
            เลือกวันที่ในสัปดาห์ที่ต้องการเขียน
          </label>
          <div className="week-title">{weekLabel(week)}</div>
        </div>
        <Input
          id="report-week"
          type="date"
          value={week}
          disabled={mutation.isPending}
          className="week-date-input"
          onChange={(e) => {
            if (e.target.value) {
              try {
                const target = weekStart(e.target.value);
                if (target !== week)
                  window.location.assign('/write?week=' + target);
              } catch {}
            }
          }}
        />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate('submitted');
        }}
      >
        <div className="report-paper editor-paper">
          {sections.map((s) => (
            <section className="editor-section" key={s.key}>
              <div className="editor-section-heading">
                <span className="section-number">{s.number}</span>
                <div>
                  <label htmlFor={s.key}>{s.title}</label>
                  <p className="small muted">{s.hint}</p>
                </div>
              </div>
              <Textarea
                id={s.key}
                value={fields[s.key]}
                disabled={mutation.isPending}
                maxLength={12000}
                placeholder={
                  s.key === 'blockers'
                    ? 'มีเรื่องไหนที่อยากให้ทีมช่วย?'
                    : 'เขียนสรุป หรือแยกเป็นข้อ ๆ ได้เลย…'
                }
                onChange={(e) => {
                  setFields({ ...fields, [s.key]: e.target.value });
                  setSavedMessage('');
                }}
                className="report-textarea"
              />
              <p className="character-count">
                {fields[s.key].length.toLocaleString()} / 12,000
              </p>
            </section>
          ))}
        </div>
        {mutation.isError && (
          <div role="alert" className="error-box">
            <p>{mutation.error.message}</p>
            <p className="small">ข้อความที่คุณกรอกยังอยู่ในหน้านี้</p>
            {conflict && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setReloadOpen(true)}
              >
                <RefreshCw />
                โหลดฉบับล่าสุด
              </Button>
            )}
            {mutation.error instanceof ClientError &&
              mutation.error.status === 401 && (
                <a
                  href="/login"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  เข้าสู่ระบบใหม่ในอีกแท็บ แล้วกลับมาบันทึก
                </a>
              )}
          </div>
        )}
        {savedMessage && (
          <div className="success-message" role="status">
            <CheckCircle2 size={18} />
            {savedMessage}
            {report && <a href={'/reports/' + report.id}>เปิดอ่านรายงาน →</a>}
          </div>
        )}
        <div className="editor-actions">
          <div className="save-state">
            <LockKeyhole size={16} />
            <span>
              {mutation.isPending
                ? 'กำลังบันทึก…'
                : dirty
                  ? 'มีข้อความที่ยังไม่ได้บันทึก'
                  : report
                    ? 'บันทึกล่าสุด ' + timeLabel(report.updatedAt)
                    : 'ฉบับร่างเห็นได้เฉพาะคุณ'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {report?.status !== 'submitted' && (
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending || (!dirty && !!report)}
                onClick={() => mutation.mutate('draft')}
              >
                <Save size={17} />
                บันทึกฉบับร่าง
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                mutation.isPending || (!dirty && report?.status === 'submitted')
              }
            >
              <Send size={17} />
              {report?.status === 'submitted' ? 'บันทึกการแก้ไข' : 'ส่งรายงาน'}
            </Button>
          </div>
        </div>
        {report?.status === 'submitted' && (
          <p className="small muted text-right mt-3">
            การบันทึกจะอัปเดตรายงานที่ทีมอ่านได้ทันที
          </p>
        )}
      </form>
      <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>โหลดรายงานฉบับล่าสุด?</AlertDialogTitle>
            <AlertDialogDescription>
              ข้อความที่ยังไม่ได้บันทึกในหน้านี้จะถูกแทนที่ กรุณาคัดลอกข้อความที่ต้องการเก็บก่อน
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reloadError && (
            <p role="alert" className="text-destructive small">
              {reloadError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reloading}>
              กลับไปคัดลอกข้อความ
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reloading}
              onClick={() => void reload()}
            >
              {reloading ? 'กำลังโหลด…' : 'โหลดฉบับล่าสุด'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
