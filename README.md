# Weekly Report

เว็บรายงานประจำสัปดาห์ภาษาไทยสำหรับหนึ่งทีม สมาชิกเข้าสู่ระบบด้วย Google เก็บฉบับร่างส่วนตัว ส่งรายงานให้ทีมอ่าน และค้นย้อนหลังตามสัปดาห์หรือผู้เขียน

## เริ่มใช้งาน

1. ติดตั้ง Node.js 24 LTS แล้วรัน `npm ci`
2. คัดลอก `.env.example` เป็น `.env` และกำหนดค่าจริงด้านล่าง
3. รัน `npm run db:local` เพื่อใช้ migrations กับ D1 จำลองบนเครื่อง
4. รัน `npm run dev -- --host 127.0.0.1 --port 3001`
5. เปิด http://localhost:3001 และเข้าด้วยอีเมลผู้ดูแลครั้งแรก

ไม่มีบัญชีตัวอย่างหรือเส้นทางข้ามการเข้าสู่ระบบ ข้อมูลทดสอบอยู่ในฐานข้อมูลแยกที่สร้างและลบโดยชุดทดสอบเท่านั้น

## ตั้งค่า Google

ทำตาม [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

- สร้าง OAuth Client ชนิด **Web application** ใน Google Auth Platform
- ตั้งชื่อแอป Weekly Report และกำหนด support email
- ใช้ข้อมูลพื้นฐาน `openid`, `email`, `profile` เท่านั้น
- เพิ่ม Authorized JavaScript origins: `http://localhost`, `http://localhost:3001` และ `https://team-weekly-report.jiratuzu.chatgpt.site`
- ใช้ GIS JavaScript callback จึงไม่มีแอป OAuth callback route และไม่ใช้ client secret
- ตั้ง homepage เป็น URL ของเว็บ และ privacy policy เป็น `/privacy` ของเว็บ กำหนด authorized domains / audience / test users ให้ตรงกับนโยบาย Google ของโปรเจกต์
- หาก Google ขอการตรวจสอบโดเมนหรือยืนยันแอป ต้องดำเนินการใน Google Auth Platform ให้เสร็จก่อนเปิดให้ทีมใช้

| ตัวแปร | ค่า |
|---|---|
| GOOGLE_CLIENT_ID | Client ID ที่ลงท้าย .apps.googleusercontent.com |
| ADMIN_EMAIL | อีเมล Gmail หรือ Google Workspace ของผู้ดูแลเริ่มต้น |
| APP_ORIGIN | Origin จริงแบบไม่มี / ท้าย; บนเครื่องใช้ http://localhost:3001 |

บน Sites ให้ตั้งค่าผ่าน runtime environment ของ Site และเผยแพร่เวอร์ชันหลังเปลี่ยนค่า ไม่ใส่ค่าใน `.openai/hosting.json` หรือ commit ไฟล์ `.env`

หากข้อมูลตั้งค่าไม่ครบ ปุ่มเข้าระบบจะปิด และ API ข้อมูลจะตอบ 503 โดยไม่เปิดทางข้ามสิทธิ์ ผู้ดูแลเริ่มต้นได้รับบทบาท admin หลัง Google ยืนยันบัญชีอีเมลนั้นสำเร็จเท่านั้น ไม่มีการยึดบัญชีจากผู้เข้าคนแรก

## พฤติกรรมและสิทธิ์

- หนึ่งรายงานต่อผู้เขียนต่อสัปดาห์ จันทร์–อาทิตย์ เขตเวลา Asia/Bangkok
- draft อ่านได้เฉพาะผู้เขียน รวมถึงการเปิดลิงก์ตรง; submitted อ่านได้ทุกสมาชิกที่ active
- ผู้ดูแลเพิ่ม/ถอนสิทธิ์สมาชิกได้ แต่ไม่มีสิทธิ์พิเศษในการอ่านร่างหรือแก้รายงานคนอื่น
- การถอนสิทธิ์เก็บรายงานไว้ ตรวจ active ทุกคำขอ และลบเซสชันเดิมทั้งหมด
- เซสชันเป็น random opaque token เก็บเฉพาะ SHA-256 ใน D1; คุกกี้ HttpOnly, Secure บน HTTPS, SameSite=Lax อายุ 7 วัน
- Google JWT ตรวจลายเซ็น issuer, audience, expiry, nonce, verified email และความเป็นเจ้าของอีเมล Google ใช้ sub เป็นรหัสบัญชี
- การแก้ไขใช้ version compare-and-swap; การ retry ที่เนื้อหาเหมือนเดิมไม่สร้างรายงานซ้ำ
- เก็บเนื้อหาล่าสุดเท่านั้น ไม่มีลบรายงาน ไฟล์แนบ หรือระบบอนุมัติ

## API

ทุก API ข้อมูลต้องมี session ส่วน mutation ต้องมี Origin ตรง APP_ORIGIN และ X-CSRF-Token

| Endpoint | การทำงาน |
|---|---|
| GET /api/auth/config | สถานะพร้อมเข้าสู่ระบบ; ไม่เผยอีเมลผู้ดูแล |
| GET /api/auth/challenge | สร้าง challenge อายุ 10 นาที |
| POST /api/auth/google | ยืนยัน Google credential พร้อม challenge และออก session |
| GET /api/auth/session | ข้อมูลบัญชีและ CSRF token |
| POST /api/auth/logout | ยกเลิก session |
| GET /api/reports | scope=team/mine, week=Monday YYYY-MM-DD, author, page; หน้าละ 20 |
| POST /api/reports | สร้างรายงาน id แบบ UUID, weekStart, 4 หัวข้อ และ status |
| GET /api/reports/:id | อ่านรายงานตามสิทธิ์ |
| PATCH /api/reports/:id | บันทึกรายงานของตัวเองพร้อม version |
| POST /api/reports/:id/submit | บันทึกเนื้อหาและส่งรายงานพร้อม version |
| GET /api/authors | ผู้เขียนที่มีรายงานส่งแล้ว |
| GET /api/members | รายชื่อสมาชิก สำหรับ admin |
| POST /api/members | เพิ่มหรือคืนสิทธิ์ด้วย email สำหรับ admin |
| DELETE /api/members/:id | ถอนสิทธิ์แบบ soft revoke สำหรับ admin |

4 หัวข้อคือ completed, inProgress, blockers, nextWeek (ข้อความไม่เกิน 12,000 ตัวอักษรต่อหัวข้อ) ส่งรายงานได้เมื่อมีอย่างน้อยหนึ่งหัวข้อไม่ว่าง

WebMCP ลงทะเบียน `list_reports`, `read_report`, `save_draft`, `submit_report` เมื่อ browser รองรับ document.modelContext และผู้ใช้เข้าสู่ระบบแล้ว ใช้ API เดียวกับ UI การเขียนอัปเดตข้อมูลบนหน้าจอด้วย เมื่อไม่รองรับ เว็บยังใช้งานปกติ

## ตรวจสอบ

```sh
npm test
npm run typecheck
npm run build
```

ชุดทดสอบใช้ SQLite จริงและเรียก API handler ตัวเดียวกับ production รวมถึง Google JWT ที่ลงลายเซ็นจริงด้วยกุญแจทดสอบ การจำลอง identity เพื่อทดสอบธุรกิจอยู่ใน tests เท่านั้น

ตรวจ migration ที่สร้างจาก `npm run db:generate` ก่อนเผยแพร่ และห้ามแก้ migration ที่ใช้บน production แล้ว

### รายการที่ต้องตรวจหลังตั้งค่า Google จริง

- เข้าสู่ระบบด้วยบัญชีผู้ดูแล และสมาชิกอย่างน้อย 2 คน
- ตรวจ Google authorized origin บน URL ที่เผยแพร่จริง
- ทดสอบ WebMCP ทั้ง input ที่ถูกและผิดในหน้าที่เข้าสู่ระบบแล้ว พร้อมอ่านข้อมูลกลับ
- รอบนี้ยังทดสอบการเข้าสู่ระบบ Google จริงและ WebMCP ในบริบทที่เข้าสู่ระบบไม่ได้ เพราะยังไม่มี Google Client ID (ตั้งผู้ดูแลเริ่มต้นตามอีเมลเจ้าของ Site ที่เชื่อมต่อแล้ว)

Dependencies ของ starter ถูกอัปเดตเฉพาะที่จำเป็นเพื่อแก้ช่องโหว่ระดับ high ที่ตรวจพบ เครื่องมือสร้าง migration ยังมี advisory ระดับ moderate ผ่าน esbuild เก่า; ไม่ถูกส่งไปเป็น Worker และงานนี้ไม่เปิด esbuild development server
