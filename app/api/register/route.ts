import {NextRequest,NextResponse} from 'next/server';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import {sendMemberWelcomeEmail,subscribeToNewsletter} from '@/lib/newsletter';

export async function POST(req:NextRequest){
  let connection:mysql.Connection|null=null;
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
    connection=await mysql.createConnection(process.env.DATABASE_URL||'mysql://smart_user:smart_password@localhost:3306/smart_home_store');
    const[rows]=await connection.execute<mysql.RowDataPacket[]>('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',[username,email]);
    if(rows.length)return NextResponse.json({error:'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว'},{status:409});
    const passwordHash=await bcrypt.hash(password,12);
    await connection.execute('INSERT INTO users (username,password_hash,first_name,last_name,email,phone,role,status,privacy_accepted_at,marketing_consent,marketing_consent_at) VALUES (?,?,?,?,?,?,?,?,NOW(),?,?)',[username,passwordHash,firstName,lastName,email,phone,'USER','ACTIVE',marketingConsent,marketingConsent?new Date():null]);
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
    return NextResponse.json({error:'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบว่า Docker ทำงานอยู่'},{status:503});
  }finally{
    await connection?.end();
  }
}
