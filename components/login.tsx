'use client';
import { useEffect, useRef, useState } from 'react';
import {
  NotebookPen,
  ShieldCheck,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sections } from '@/lib/reports';
type GoogleWindow = Window & {
  google?: {
    accounts: {
      id: {
        initialize: (options: Record<string, unknown>) => void;
        renderButton: (
          element: HTMLElement,
          options: Record<string, unknown>,
        ) => void;
      };
    };
  };
};
export function Login({ ready }: { ready: boolean }) {
  const mount = useRef<HTMLDivElement>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function setup() {
      try {
        const response = await fetch('/api/auth/challenge', {
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          clientId: string;
          csrfToken: string;
          nonce: string;
          error?: string;
        };
        if (!response.ok) throw Error(data.error);
        if (!(window as GoogleWindow).google) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () =>
              reject(Error('โหลด Google ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'));
            document.head.appendChild(script);
          });
        }
        if (cancelled || !mount.current) return;
        const google = (window as GoogleWindow).google!;
        google.accounts.id.initialize({
          client_id: data.clientId,
          nonce: data.nonce,
          auto_select: false,
          callback: async ({ credential }: { credential: string }) => {
            setBusy(true);
            setError('');
            try {
              const result = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential, csrfToken: data.csrfToken }),
              });
              const payload = (await result.json()) as { error?: string };
              if (!result.ok) throw Error(payload.error);
              window.location.assign('/');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
              setBusy(false);
              setLoaded(false);
              setAttempt((a) => a + 1);
            }
          },
        });
        mount.current.replaceChildren();
        google.accounts.id.renderButton(mount.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with',
          shape: 'rectangular',
          locale: 'th',
        });
        setLoaded(true);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
      }
    }
    void setup();
    return () => {
      cancelled = true;
    };
  }, [ready, attempt]);
  return (
    <main className="login-shell">
      <section className="login-panel">
        <a className="brand" href="/">
          <span className="brand-icon">
            <NotebookPen size={24} />
          </span>
          <span>
            weekly<span className="brand-dot">.</span>
            <small>TEAM REPORT</small>
          </span>
        </a>
        <div className="login-content">
          <span className="eyebrow">หนึ่งสัปดาห์ · หนึ่งบันทึก</span>
          <h1>
            ทุกความคืบหน้า
            <br />
            กลับมาอ่านได้เสมอ<span className="brand-dot">.</span>
          </h1>
          <p className="lead">
            พื้นที่รายงานประจำสัปดาห์ของทีม
            <br />
            บันทึกสิ่งที่ทำ ส่งต่อสิ่งที่ต้องรู้ แล้วเดินหน้าสัปดาห์ใหม่ไปด้วยกัน
          </p>
          <div className="login-action">
            {ready ? (
              <>
                <div
                  ref={mount}
                  className={busy ? 'pointer-events-none opacity-50' : ''}
                />
                {(!loaded || busy) && (
                  <p role="status" className="muted small">
                    {busy ? 'กำลังเข้าสู่ระบบ…' : 'กำลังเชื่อมต่อ Google…'}
                  </p>
                )}
              </>
            ) : (
              <>
                <Button disabled className="google-button">
                  เข้าสู่ระบบด้วย Google
                </Button>
                <p className="setup-note">
                  <AlertCircle size={18} />
                  <span>
                    ยังไม่เปิดใช้งานการเข้าสู่ระบบ
                    <br />
                    <span className="muted">กรุณาติดต่อผู้ดูแลทีมเพื่อตั้งค่าครั้งแรก</span>
                  </span>
                </p>
              </>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
                <Button
                  variant="link"
                  onClick={() => {
                    setError('');
                    setAttempt((a) => a + 1);
                  }}
                >
                  ลองอีกครั้ง
                </Button>
              </div>
            )}
          </div>
          <div className="privacy-note">
            <ShieldCheck size={18} /> รายงานเปิดอ่านได้เฉพาะสมาชิกที่ได้รับสิทธิ์
          </div>
        </div>
        <footer className="login-footer">
          WEEKLY REPORT <a href="/privacy">ความเป็นส่วนตัว</a>
        </footer>
      </section>
      <aside className="login-aside">
        <div className="report-preview">
          <div className="preview-top">
            <span className="eyebrow">WEEKLY REPORT</span>
            <CalendarDays size={22} />
          </div>
          <h2>สัปดาห์ของเรา</h2>
          <p className="muted">4 หัวข้อที่ช่วยให้ทีมเห็นภาพเดียวกัน</p>
          {sections.map((s) => (
            <div className="preview-section" key={s.key}>
              <span>{s.number}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.hint}</p>
              </div>
            </div>
          ))}
          <div className="preview-bottom">
            <span className="status-dot" /> บันทึกเป็นร่างได้ ก่อนพร้อมส่งให้ทีม
          </div>
        </div>
        <p className="aside-caption">เขียนวันนี้ · เห็นความก้าวหน้าในวันข้างหน้า</p>
      </aside>
    </main>
  );
}
