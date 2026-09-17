import {NextRequest,NextResponse} from 'next/server';
import {getSessionUser} from '@/lib/auth';
import {db} from '@/lib/db';
export async function GET(){const user=await getSessionUser();return user?NextResponse.json({user}):NextResponse.json({error:'กรุณาเข้าสู่ระบบ'},{status:401})}
export async function PATCH(req:NextRequest){const user=await getSessionUser();if(!user)return NextResponse.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});const body=await req.json().catch(()=>null) as {firstName?:string;lastName?:string;phone?:string}|null;const firstName=body?.firstName?.trim()||'',lastName=body?.lastName?.trim()||'',phone=body?.phone?.trim()||'';if(!firstName||!lastName||!/^\d{9,10}$/.test(phone))return NextResponse.json({error:'กรุณากรอกข้อมูลให้ถูกต้อง'},{status:400});await db.execute('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?',[firstName,lastName,phone,user.id]);return NextResponse.json({message:'บันทึกข้อมูลเรียบร้อย'})}

