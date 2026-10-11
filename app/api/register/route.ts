import {NextRequest,NextResponse} from 'next/server';
import bcrypt from 'bcryptjs';
import {eq,or} from 'drizzle-orm';
import {getDb} from '@/db';
import {users} from '@/db/schema';
import {sendMemberWelcomeEmail,subscribeToNewsletter} from '@/lib/newsletter';

export async function POST(req:NextRequest){
  try{
    const body=await req.json() as Record<string,unknown>;
    const username=String(body.username||'').trim();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    const firstName=String(body.firstName||'').trim();
    const lastName=String(body.lastName||'').trim();
    const phone=String(body.phone||'').trim();
    const privacyConsent=body.privacyConsent==='on'||body.privacyConsent===true;
    const marketingConsent=body.marketingConsent==='on'||body.marketingConsent===true;
    const hasEnglishLetter=/[A-Za-z]/.test(password);
    if(username.length<4||!/^\S+@\S+\.\S+$/.test(email)||!firstName||!lastName||!/^\d{9,10}$/.test(phone))return NextResponse.json({error:'กรุณากรอกข้อมูลให้ถูกต้องและครบถ้วน'},{status:400});
    if(email.endsWith('@gamil.com'))return NextResponse.json({error:'โดเมนอีเมลสะกดผิด กรุณาเปลี่ยน @gamil.com เป็น @gmail.com'},{status:400});
    if(password.length<8||!hasEnglishLetter)return NextResponse.json({error:'รหัสผ่านต้องมีอย่างน้อย 8 ตัว และมีอักษรอังกฤษอย่างน้อย 1 ตัว'},{status:400});
    if(!privacyConsent)return NextResponse.json({error:'กรุณายอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว'},{status:400});
    const database=getDb();
    const rows=await database.select({id:users.id}).from(users).where(or(eq(users.username,username),eq(users.email,email))).limit(1);
    if(rows.length)return NextResponse.json({error:'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว'},{status:409});
    const passwordHash=await bcrypt.hash(password,12);
    await database.insert(users).values({username,passwordHash,firstName,lastName,email,phone,role:'USER',status:'ACTIVE',privacyAcceptedAt:new Date().toISOString(),marketingConsent,marketingConsentAt:marketingConsent?new Date().toISOString():null,createdAt:new Date().toISOString()});
    try{
      const result=await sendMemberWelcomeEmail({email,firstName,lastName});
      if(!result.ok)console.error('register_member_email_failed',result.status,result.data);
    }catch(error){
      console.error('register_member_email_failed',error);
    }
    if(marketingConsent){
      try{
        const result=await subscribeToNewsletter({email,firstName:`${firstName} ${lastName}`.trim().slice(0,100),consent:true});
        if(!result.ok)console.error('register_newsletter_failed',result.status,result.data);
      }catch(error){
        console.error('register_newsletter_failed',error);
      }
    }
    return NextResponse.json({message:'สมัครสมาชิกสำเร็จ'},{status:201});
  }catch(error){
    console.error('register_failed',error);
    const message=error instanceof Error?error.message:'';
    if(message.includes('UNIQUE constraint failed'))return NextResponse.json({error:'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว'},{status:409});
    return NextResponse.json({error:'สมัครสมาชิกไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า D1 และลองอีกครั้ง'},{status:503});
  }
}
