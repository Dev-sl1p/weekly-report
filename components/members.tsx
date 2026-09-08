'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  UserMinus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
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
import { useApi } from './workspace';
import { ErrorState, LoadingRows } from './report-list';
import type { Member } from '@/lib/reports';
export function Members() {
  const api = useApi(),
    client = useQueryClient(),
    [email, setEmail] = useState(''),
    [target, setTarget] = useState<Member | null>(null),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: Member[] }>('members'),
  });
  const add = useMutation({
    mutationFn: (email: string) => api('members', 'POST', { email }),
    onSuccess: async () => {
      setEmail('');
      setMessage('เพิ่มสิทธิ์แล้ว สมาชิกใช้บัญชี Google เข้าสู่ระบบได้เลย');
      await client.invalidateQueries({ queryKey: ['members'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api('members/' + encodeURIComponent(id), 'DELETE'),
    onSuccess: async () => {
      setTarget(null);
      setMessage('ถอนสิทธิ์แล้ว รายงานเดิมยังอยู่ในประวัติของทีม');
      await client.invalidateQueries({ queryKey: ['members'] });
    },
  });
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TEAM MEMBERS</span>
          <h1>สมาชิกทีม</h1>
          <p className="muted">กำหนดว่าใครเขียนและอ่านรายงานในพื้นที่นี้ได้</p>
        </div>
        <span className="admin-label">
          <ShieldCheck size={17} />
          ผู้ดูแลทีม
        </span>
      </div>
      <section className="add-member-panel">
        <div className="flex gap-3 items-start">
          <span className="my-report-icon">
            <UserPlus size={22} />
          </span>
          <div>
            <h2>เพิ่มสมาชิกด้วยอีเมล</h2>
            <p className="small muted">
              ใช้ Gmail หรือ Google Workspace · ไม่มีการส่งอีเมลเชิญอัตโนมัติ
            </p>
          </div>
        </div>
        <form
          className="add-member-form"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage('');
            add.mutate(email);
          }}
        >
          <label className="sr-only" htmlFor="member-email">
            อีเมลสมาชิก
          </label>
          <Input
            type="email"
            id="member-email"
            placeholder="name@company.com"
            value={email}
            required
            maxLength={254}
            disabled={add.isPending}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={add.isPending}>
            <UserPlus size={17} />
            {add.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มสมาชิก'}
          </Button>
        </form>
        {add.isError && (
          <p role="alert" className="text-destructive small mt-3">
            {add.error.message}
          </p>
        )}
      </section>
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <section className="reports-panel members-panel">
        <div className="section-title">
          <Users size={20} />
          <h2>รายชื่อสมาชิก</h2>
          <span className="muted small">
            {query.data?.members.filter((m) => m.active).length || 0} คนที่มีสิทธิ์
          </span>
        </div>
        {query.isPending ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สมาชิก</TableHead>
                <TableHead>บทบาท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-semibold">{m.name || m.email}</div>
                    {m.name && <div className="small muted">{m.email}</div>}
                  </TableCell>
                  <TableCell>{m.role === 'admin' ? 'ผู้ดูแล' : 'สมาชิก'}</TableCell>
                  <TableCell>
                    <span
                      className={
                        'status-badge ' + (m.active ? 'submitted' : 'inactive')
                      }
                    >
                      {!m.active
                        ? 'ถอนสิทธิ์แล้ว'
                        : m.userId
                          ? 'ใช้งานอยู่'
                          : 'รอเข้าสู่ระบบ'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {m.role !== 'admin' &&
                      (m.active ? (
                        <Button
                          variant="ghost"
                          className="text-destructive"
                          disabled={remove.isPending}
                          onClick={() => {
                            remove.reset();
                            setTarget(m);
                          }}
                        >
                          <UserMinus size={16} />
                          <span>ถอนสิทธิ์</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={add.isPending}
                          onClick={() => add.mutate(m.email)}
                        >
                          <RotateCcw size={16} />
                          คืนสิทธิ์
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <AlertDialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ถอนสิทธิ์สมาชิก?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.email} จะเข้าถึงเว็บต่อไม่ได้ทันที รายงานที่ส่งแล้วจะยังอยู่ในประวัติของทีม
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && (
            <p role="alert" className="small text-destructive">
              {remove.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (target) remove.mutate(target.id);
              }}
            >
              {remove.isPending ? 'กำลังถอนสิทธิ์…' : 'ถอนสิทธิ์'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
