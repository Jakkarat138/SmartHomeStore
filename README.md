# Smart Home Store — Mini Project

เทคโนโลยี: Next.js, TypeScript, Tailwind CSS, MySQL, REST API, bcrypt และ Docker Compose

## เริ่มใช้งาน

1. เปิด Docker Desktop
2. รัน `docker compose up --build`
3. เปิด `http://localhost:3000`
4. หน้าสมัครสมาชิกอยู่ที่ `http://localhost:3000/register`

MySQL จะสร้างฐานข้อมูล `smart_home_store` และข้อมูลสินค้าตัวอย่างให้อัตโนมัติ ข้อมูลถูกเก็บใน Docker volume `mysql_data`

## ระบบสมัครรับข่าวสารผ่าน PHP

ฟอร์มสมัครรับข่าวสารอยู่ด้านล่างของหน้าแรก ระบบจะบันทึกความยินยอมใน MySQL และส่งอีเมลผ่านบริการ PHP

เมื่อผู้ใช้สร้างบัญชีสำเร็จ ระบบจะส่งอีเมลต้อนรับสมาชิกแยกอีกหนึ่งฉบับผ่าน `newsletter/public/member-welcome.php` โดยอัตโนมัติ ส่วนผู้ใช้ที่เลือกยินยอมรับข่าวสารจะได้รับอีเมลข่าวสารเพิ่มอีกหนึ่งฉบับ

- หน้าเว็บร้าน: `http://localhost:3000`
- กล่องอีเมลทดสอบ Mailpit: `http://localhost:8025`
- บริการ PHP และหน้ายกเลิกข่าวสาร: `http://localhost:8081`

ค่าเริ่มต้นจะส่งเข้า Mailpit เพื่อให้ทดสอบได้โดยไม่ส่งอีเมลจริง เมื่อต้องการส่งถึงลูกค้าจริง ให้กำหนด `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_ENCRYPTION`, `MAIL_FROM`, `SHOP_URL` และ `NEWSLETTER_PUBLIC_URL` ในไฟล์ `.env` ด้วยข้อมูลจากผู้ให้บริการอีเมล ห้ามเขียนรหัสผ่าน SMTP ไว้ในไฟล์ PHP หรือ commit เข้า Git

## ระบบผู้ดูแล

สมัครสมาชิกด้วยบัญชีที่ต้องการก่อน แล้วกำหนดสิทธิ์ให้บัญชีนั้นโดยระบุอีเมลอย่างชัดเจน:

`docker exec -e ADMIN_EMAIL=your-email@example.com smart-home-app npm run admin:promote`

ออกจากระบบและเข้าสู่ระบบใหม่ จากนั้นเปิด `http://localhost:3000/admin`

## หยุดระบบ

รัน `docker compose down` (ข้อมูลยังคงอยู่)
