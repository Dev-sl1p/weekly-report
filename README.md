# Weekly Report

เว็บรายงานประจำสัปดาห์ภาษาไทยสำหรับหนึ่งทีม: Google Login, ฉบับร่างส่วนตัว, ส่งรายงานให้ทีมอ่าน และค้นย้อนหลังตามสัปดาห์หรือผู้เขียน

**Next.js / React / TypeScript / Shadcn → Vercel · PostgreSQL → Supabase**

## เริ่มบนเครื่อง

ติดตั้ง Node.js 24 แล้วรัน `npm ci` คัดลอก `.env.example` เป็น `.env.local` และทำขั้นตอน Supabase/Google ด้านล่าง จากนั้น:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3001
```

เปิด `http://localhost:3001` ระบบปิดปุ่มเข้าสู่ระบบและตอบ API เป็น 503 จนกว่าจะตั้ง `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, `APP_ORIGIN` ครบ ไม่มีบัญชีตัวอย่างหรือเส้นทางข้ามการเข้าสู่ระบบ

## 1. สร้างฐานข้อมูล Supabase

1. สร้างโปรเจกต์ Supabase เลือก region ใกล้ทีมและ Vercel
2. เปิด **Connect → Session pooler** คัดลอก connection string พอร์ต **5432** ใส่รหัสผ่านฐานข้อมูล แล้วเก็บเป็น `DIRECT_URL` ใน `.env.local` ใช้ admin connection นี้สำหรับ migration บนเครื่องเท่านั้น
3. รัน `npm run db:migrate` เพื่อสร้างตารางจาก `supabase/migrations/20260908000100_weekly_report.sql` ได้ schema `weekly_report`, ตาราง 5 ตัว, constraints, indexes, RLS และ role สำหรับเซิร์ฟเวอร์ มี transaction, advisory lock และ checksum ป้องกันการรันซ้ำหรือแก้ migration ที่เคยใช้แล้ว
4. ใน Supabase **SQL Editor** สร้าง login สำหรับ Vercel โดยแทนรหัสผ่านตัวอย่างด้วยค่าจริง:

```sql
CREATE ROLE weekly_report_login
  LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  IN ROLE weekly_report_app;
```

5. เปิด **Connect → Transaction pooler** พอร์ต **6543** ใช้ host ของโปรเจกต์ เปลี่ยน username เป็น `weekly_report_login.PROJECT_REF` และใช้รหัสผ่านจากข้อ 4 เก็บเป็น `DATABASE_URL`:

```dotenv
DATABASE_URL=postgresql://weekly_report_login.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:6543/postgres
```

ชื่อ host ต้องคัดลอกจาก Supabase จริง รหัสผ่านที่มีอักขระพิเศษต้อง URL-encode ตัว driver ใช้ `prepare: false` สำหรับ transaction pooler และตรวจ TLS certificate พร้อม hostname โค้ดรวม Supabase Root 2021 CA จากแหล่งทางการสำหรับโดเมน Supabase ไว้แล้ว หากโปรเจกต์ใช้ CA อื่น ให้ใส่ PEM ใน `DATABASE_CA_CERT` โดยแทนการขึ้นบรรทัดด้วย `\n` อ้างอิง [Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement)

ใน Table Editor เลือก schema **weekly_report** เพื่อดูตาราง อย่าเพิ่ม schema นี้ใน **Data API → Exposed schemas**

แอปใช้ Supabase เป็น PostgreSQL ผ่าน API ฝั่ง Next.js และคง Google Identity Services กับเซสชันของแอปตามแผนเดิม จึงไม่ต้องเปิด Google provider ใน Supabase Auth และไม่ต้องใช้ publishable key หรือ service-role key บนหน้าเว็บ

อ้างอิง: [Supabase connection poolers](https://supabase.com/docs/guides/database/connecting-to-postgres), [สร้าง database roles](https://supabase.com/docs/guides/database/postgres/roles)

## 2. ตั้งค่า Google Login

ทำตาม [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

- สร้าง OAuth Client ชนิด **Web application** ใน Google Auth Platform
- กำหนดชื่อแอป, support email, audience และ test users ให้ตรงกับทีม ใช้ข้อมูลพื้นฐาน `openid`, `email`, `profile`
- เพิ่ม **Authorized JavaScript origins**: `http://localhost`, `http://localhost:3001` และ origin จริงของ Vercel เช่น `https://YOUR_PROJECT.vercel.app` โดยไม่มี `/` ท้าย
- ตั้ง homepage เป็น URL ของเว็บ และ privacy policy เป็น `/privacy` ของเว็บ
- ใช้ GIS JavaScript callback จึงไม่มี OAuth redirect route ของแอปและไม่ใช้ client secret
- หาก Google ขอการยืนยันโดเมนหรือแอป ให้ดำเนินการใน Google Auth Platform

ตั้ง `GOOGLE_CLIENT_ID` เป็น Client ID ที่ลงท้าย `.apps.googleusercontent.com` และ `ADMIN_EMAIL` เป็นอีเมลผู้ดูแลเริ่มต้น ต้องเป็น Gmail หรือ Google Workspace ผู้ดูแลถูกเพิ่มหลัง Google ยืนยันบัญชีตรงกับอีเมลที่ตั้งไว้เท่านั้น ไม่ให้สิทธิ์จากการเป็นคนแรกที่เข้าเว็บ

## 3. Deploy บน Vercel

1. Push โค้ดเข้า GitHub แล้วเลือก **Vercel → Add New → Project → Import Git Repository**
2. เลือก Framework **Next.js**, Root Directory เป็นราก repository, Node.js **24.x** ใช้ค่าตาม `vercel.json` (`npm ci`, `npm run build`)
3. ตั้ง **Environment Variables → Production**:

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler ของ `weekly_report_login` จากด้านบน |
| `GOOGLE_CLIENT_ID` | Google Web application Client ID |
| `ADMIN_EMAIL` | อีเมลผู้ดูแลเริ่มต้น |
| `APP_ORIGIN` | Origin จริง เช่น `https://YOUR_PROJECT.vercel.app` ไม่มี `/` ท้าย |
| `DATABASE_CA_CERT` | ตั้งเฉพาะเมื่อ connection ต้องใช้ Supabase root certificate |

เก็บ database connection เป็น Sensitive environment variable ไม่ใส่ prefix `NEXT_PUBLIC_` และไม่ต้องตั้ง `DIRECT_URL` บน Vercel

4. Deploy หลังรู้ URL จริง ให้ตรวจว่า `APP_ORIGIN` และ Google Authorized JavaScript origins ตรงกับ URL นั้น หากเปลี่ยน environment ให้ **Redeploy**
5. เข้าด้วย Google ของผู้ดูแล เปิด **สมาชิก** แล้วเพิ่มอีเมลทีม ระบบไม่ส่งอีเมลเชิญอัตโนมัติ

เลือก Function Region ให้ใกล้ Supabase ใน Vercel Project Settings ฐานข้อมูลไม่ถูกแก้ระหว่าง `npm run build`; เมื่อเพิ่ม migration ใหม่ ให้ผู้ดูแลรัน `npm run db:migrate` แยกก่อน deploy

Preview ที่ยังไม่ตั้ง environment จะเปิดได้เฉพาะหน้า login ที่ปิดการเข้าสู่ระบบ หากต้องการทดสอบ Preview พร้อมข้อมูล ให้ใช้ Supabase โปรเจกต์ทดสอบและ origin ที่ลงทะเบียนกับ Google แยกจาก production

อ้างอิง: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)

### ตั้ง env แล้วแต่ยังเข้าสู่ระบบไม่ได้

- เปิด `/api/auth/config` บนโดเมนที่ใช้งานจริง: `ready` บอกว่าค่าตั้งต้นครบหรือไม่ และ `issues` ระบุเฉพาะชื่อตัวแปรกับปัญหาโดยไม่แสดงค่า secret
- ระบบตัดช่องว่างหัวท้าย และรองรับ `APP_ORIGIN` ที่มี `/` ท้าย URL แต่ไม่รับ path เช่น `/login`, query หรือ URL ที่มี username/password
- บน Vercel ต้องเลือก environment ให้ตรงกับ deployment และ Redeploy หลังเปลี่ยน env จากนั้นเปิด `/login` ใหม่บน production domain
- `ready: true` ยังไม่ใช่การยืนยันว่าเชื่อมฐานข้อมูลสำเร็จ เมื่อเปิดหน้า login จะเรียก `/api/auth/challenge` หากล้มเหลว หน้าเว็บจะแยกข้อความสำหรับ migration, สิทธิ์, รหัสผ่าน, TLS certificate หรือการเชื่อมต่อ ตรวจรายละเอียดเพิ่มเติมใน Vercel Logs ของคำขอนี้

## สิทธิ์และข้อมูล

- หนึ่งรายงานต่อคนต่อสัปดาห์ จันทร์–อาทิตย์ เขตเวลา Asia/Bangkok เขียนย้อนหลังได้
- หัวข้อ: งานที่เสร็จ, งานที่กำลังทำ, ปัญหา/ความช่วยเหลือ, แผนสัปดาห์หน้า
- ร่างอ่านได้เฉพาะผู้เขียน รวมถึงลิงก์ตรง ผู้ดูแลไม่มีสิทธิ์อ่านร่างหรือแก้รายงานของคนอื่น
- รายงานที่ส่งแล้วอ่านได้ทุกสมาชิกที่ active เจ้าของบันทึกการแก้ไขทับเนื้อหาล่าสุดได้
- ถอนสิทธิ์แล้วเข้าถึงข้อมูลไม่ได้ ตรวจ active ทุกคำขอและลบเซสชันทั้งหมด แต่เก็บรายงานเดิม
- Google `sub` เป็นรหัสบัญชี ตรวจ JWT signature, issuer, audience, expiry, nonce และ verified email [ตามแนวทาง Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- คุกกี้ HttpOnly / SameSite=Lax / Secure บน HTTPS อายุ 7 วัน เก็บเฉพาะ SHA-256 ของ token ใน PostgreSQL
- Mutation ต้องมี Origin ตรง `APP_ORIGIN` และ `X-CSRF-Token`; การแก้ไขใช้ version compare-and-swap ป้องกันแท็บเก่าเขียนทับ
- ข้อความคงอยู่ใน editor เมื่อ API ไม่สำเร็จ ไม่มีไฟล์แนบ ระบบอนุมัติ การลบรายงาน หรือประวัติทุกการแก้ไข

Schema ส่วนตัวปิดสิทธิ์ของ `PUBLIC`, `anon`, `authenticated`, `service_role` และเปิด RLS ทุกตาราง บัญชีเซิร์ฟเวอร์ใช้ role `weekly_report_app` โดยสิทธิ์รายบุคคลตรวจใน `lib/server/service.ts` ทุก API ไม่ได้ใช้ Supabase `auth.uid()` ผู้ดูแลฐานข้อมูลยังเข้าถึงฐานข้อมูลได้ตามหน้าที่

## API และ WebMCP

| Endpoint | การทำงาน |
|---|---|
| `GET /api/auth/config` | สถานะตั้งค่า ไม่เผยอีเมลผู้ดูแล |
| `GET /api/auth/challenge` | challenge อายุ 10 นาที ใช้ครั้งเดียว |
| `POST /api/auth/google` | ยืนยัน Google credential และสร้าง session |
| `GET /api/auth/session` | บัญชีปัจจุบันและ CSRF token |
| `POST /api/auth/logout` | ยกเลิก session |
| `GET /api/reports` | scope=team/mine, week=Monday YYYY-MM-DD, author, page; หน้าละ 20 |
| `POST /api/reports` | สร้างรายงานด้วย UUID, weekStart, เนื้อหา 4 หัวข้อ และ status |
| `GET /api/reports/:id` | อ่านรายงานตามสิทธิ์ |
| `PATCH /api/reports/:id` | บันทึกรายงานตัวเองพร้อม version |
| `POST /api/reports/:id/submit` | บันทึกและส่งรายงานตัวเองพร้อม version |
| `GET /api/authors` | ผู้เขียนที่มีรายงานส่งแล้ว |
| `GET /api/members` | สมาชิก สำหรับ admin |
| `POST /api/members` | เพิ่ม/คืนสิทธิ์ด้วย email สำหรับ admin |
| `DELETE /api/members/:id` | ถอนสิทธิ์และยกเลิกเซสชัน สำหรับ admin |

เมื่อเบราว์เซอร์รองรับ `document.modelContext` จะลงทะเบียน `list_reports`, `read_report`, `save_draft`, `submit_report` หลังเข้าสู่ระบบ ใช้ API และตรรกะเดียวกับหน้าเว็บ

## ตรวจสอบ

```sh
npm test
npm run typecheck
npm run build
```

ชุดทดสอบ API ใช้ PostgreSQL engine ผ่าน PGlite บนเครื่อง แยกฐานข้อมูลทุกกรณีและรันด้วย role ของแอป ทดสอบ migrations, rollback, การปิด Data API, ร่างส่วนตัว, สมาชิก, การถอนสิทธิ์, เซสชัน, duplicate, concurrent update, archive, ข้อมูลหลังปิด/เปิดฐานข้อมูล และสัปดาห์คร่อมปี ชุดทดสอบ Google JWT ใช้ test keys ไม่ใช้บัญชีจริง CI ใน `.github/workflows/checks.yml` รัน tests, typecheck และ build

`npm run lint` ยังมีรายการจาก UI starter เดิม เช่น Shadcn render composition, native links ที่ใช้เพื่อเตือนก่อนออกจากหน้าที่มีข้อความค้าง และ React effect rules จึงยังไม่รวม lint ใน CI

หลังตั้งค่าจริงยังต้องทดสอบ Google Login, การเชื่อมต่อ Supabase จาก Vercel, บันทึกแล้ว refresh/เข้าใหม่ และ WebMCP ในเบราว์เซอร์ที่รองรับ ไม่มีฐานข้อมูล Supabase หรือ Vercel deployment ถูกสร้างอัตโนมัติจากโค้ดนี้

## การย้ายจากรุ่น Sites / D1

โค้ดปัจจุบันเตรียมสำหรับ Vercel + Supabase แล้ว การเปลี่ยนโค้ดไม่ได้ย้ายข้อมูลจาก D1 หรือปิดเว็บ Sites เดิม หากมีข้อมูลเดิมอยู่ ให้ export และตรวจยอดผู้ใช้/สมาชิก/รายงานก่อน import เข้า schema ใหม่ ต้องรักษา Google sub, report ID, week และ version เพื่อให้ลิงก์/สิทธิ์ถูกต้อง ผู้ใช้เข้าสู่ระบบใหม่บนโดเมน Vercel
