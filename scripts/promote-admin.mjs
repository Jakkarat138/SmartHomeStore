import mysql from 'mysql2/promise';
const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
if(!email){console.error('กรุณาระบุ ADMIN_EMAIL');process.exit(1)}
const connection=await mysql.createConnection(process.env.DATABASE_URL);
try{const[result]=await connection.execute('UPDATE users SET role = ? WHERE email = ?',['ADMIN',email]);if(!result.affectedRows){console.error('ไม่พบบัญชีอีเมลนี้ กรุณาสมัครสมาชิกก่อน');process.exitCode=1}else console.log(`กำหนด ${email} เป็นผู้ดูแลระบบแล้ว`)}finally{await connection.end()}

