'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import {
  NotebookPen,
  CalendarDays,
  Archive,
  Users,
  LogOut,
  PenLine,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { requestApi } from '@/lib/client-api';
import type { User } from '@/lib/reports';
import { WebMCP } from './webmcp';
type Auth = { user: User; csrfToken: string };
const AuthContext = createContext<Auth | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw Error('Missing session');
  return auth;
}
export function useApi() {
  const { csrfToken, user } = useAuth();
  return useCallback(
    <T,>(path: string, method = 'GET', body?: unknown) =>
      requestApi<T>(path, csrfToken, method, body, true, user.id),
    [csrfToken, user.id],
  );
}
export function Workspace({
  auth,
  children,
}: {
  auth: Auth;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  const path = usePathname(),
    [logoutError, setLogoutError] = useState(''),
    [loggingOut, setLoggingOut] = useState(false);
  const navigation = [
    { href: '/', label: 'สัปดาห์นี้', icon: CalendarDays },
    { href: '/reports', label: 'รายงานย้อนหลัง', icon: Archive },
    ...(auth.user.role === 'admin'
      ? [{ href: '/members', label: 'สมาชิกทีม', icon: Users }]
      : []),
  ];
  async function logout() {
    setLoggingOut(true);
    try {
      await requestApi(
        'auth/logout',
        auth.csrfToken,
        'POST',
        undefined,
        true,
        auth.user.id,
      );
      queryClient.clear();
      window.location.assign('/login');
    } catch {
      setLogoutError('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
      setLoggingOut(false);
    }
  }
  return (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>
        <WebMCP />
        <SidebarProvider>
          <Sidebar className="app-sidebar">
            <SidebarHeader className="sidebar-brand">
              <a href="/" className="brand">
                <span className="brand-icon">
                  <NotebookPen size={22} />
                </span>
                <span>
                  weekly<span className="brand-dot">.</span>
                  <small>TEAM REPORT</small>
                </span>
              </a>
            </SidebarHeader>
            <SidebarContent className="px-4">
              <p className="nav-caption">พื้นที่ทำงาน</p>
              <SidebarMenu>
                {navigation.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      className="nav-link"
                      isActive={
                        href === '/' ? path === '/' : path.startsWith(href)
                      }
                      render={<a href={href} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
              <div className="sidebar-note">
                <PenLine size={21} />
                <p>
                  บันทึกความคืบหน้า
                  <br />
                  ทีละสัปดาห์
                </p>
                <span>ย้อนกลับมาดูได้ทุกเมื่อ</span>
              </div>
            </SidebarContent>
            <SidebarFooter className="sidebar-user">
              <div className="user-row">
                <span className="avatar">{auth.user.name.slice(0, 1)}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{auth.user.name}</p>
                  <p className="small muted truncate">
                    {auth.user.role === 'admin' ? 'ผู้ดูแลทีม' : 'สมาชิกทีม'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={logout}
                disabled={loggingOut}
              >
                <LogOut size={16} /> ออกจากระบบ
              </Button>
              {logoutError && (
                <p role="alert" className="small text-destructive">
                  {logoutError}
                </p>
              )}
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <header className="workspace-header">
              <div className="flex items-center gap-3">
                <SidebarTrigger aria-label="เปิดหรือปิดเมนู" />
                <span className="header-divider" />
                <span className="small muted">รายงานประจำสัปดาห์</span>
              </div>
              <span className="workspace-private">
                <span className="status-dot" /> เฉพาะสมาชิกทีม
              </span>
            </header>
            <div className="workspace-content">{children}</div>
            <footer className="workspace-footer">
              <span>WEEKLY REPORT</span>
              <span>เวลาประเทศไทย · จันทร์–อาทิตย์</span>
            </footer>
          </SidebarInset>
        </SidebarProvider>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
