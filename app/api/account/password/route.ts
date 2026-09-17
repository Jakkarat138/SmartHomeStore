import bcrypt from 'bcryptjs';
import type {RowDataPacket} from 'mysql2';
import {NextRequest,NextResponse} from 'next/server';
import {getSessionUser} from '@/lib/auth';
import {db} from '@/lib/db';

type UserRow=RowDataPacket&{password_hash:string};

export async function PATCH(req:NextRequest){
 const user=await getSessionUser();
 if(!user)return NextResponse.json({error:'กรุณาเข้าสู่ระบบใหม่'},{status:401});
 const origin=req.headers.get('origin');
 if(origin){try{if(new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403})}catch{return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403})}}
 const body=await req.json().catch(()=>null) as {currentPassword?:string;newPassword?:string;confirmPassword?:string}|null;
 const currentPassword=String(body?.currentPassword||''),newPassword=String(body?.newPassword||''),confirmPassword=String(body?.confirmPassword||'');
 if(!currentPassword||!newPassword||!confirmPassword||currentPassword.length>128)return NextResponse.json({error:'กรุณากรอกรหัสผ่านให้ครบทุกช่อง'},{status:400});
 if(newPassword.length<8||newPassword.length>128||!/[A-Za-z]/.test(newPassword))return NextResponse.json({error:'รหัสผ่านใหม่ต้องมี 8–128 ตัว และมีอักษรอังกฤษอย่างน้อย 1 ตัว'},{status:400});
 if(newPassword!==confirmPassword)return NextResponse.json({error:'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'},{status:400});
 try{
  const[rows]=await db.execute<UserRow[]>('SELECT password_hash FROM users WHERE id=? AND status=\'ACTIVE\' LIMIT 1',[user.id]);
  const account=rows[0];
  if(!account||!await bcrypt.compare(currentPassword,account.password_hash))return NextResponse.json({error:'รหัสผ่านปัจจุบันไม่ถูกต้อง'},{status:400});
  if(await bcrypt.compare(newPassword,account.password_hash))return NextResponse.json({error:'รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านปัจจุบัน'},{status:400});
  const passwordHash=await bcrypt.hash(newPassword,12);
  await db.execute('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,user.id]);
  return NextResponse.json({message:'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'});
 }catch(error){console.error('password_change_failed',error);return NextResponse.json({error:'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง'},{status:500})}
}
