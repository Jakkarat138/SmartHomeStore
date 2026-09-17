import {NextRequest,NextResponse} from 'next/server';
import {subscribeToNewsletter} from '@/lib/newsletter';
import {getSessionUser} from '@/lib/auth';

export const runtime='nodejs';

export async function POST(req:NextRequest){
  const origin=req.headers.get('origin');
  if(origin){
    try{
      if(new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403});
    }catch{
      return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403});
    }
  }

  try{
    const body=await req.json() as Record<string,unknown>;
    const user=await getSessionUser();
    const email=String(body.email||'').trim().toLowerCase();
    const firstName=user?`${user.name} ${user.lastName}`.trim().slice(0,100):'';
    const company=String(body.company||'').trim();
    const consent=body.consent===true||body.consent==='true'||body.consent==='on'||body.consent===1;
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>191)return NextResponse.json({error:'กรุณากรอกอีเมลให้ถูกต้อง'},{status:422});
    if(email.endsWith('@gamil.com'))return NextResponse.json({error:'โดเมนอีเมลสะกดผิด กรุณาเปลี่ยน @gamil.com เป็น @gmail.com'},{status:422});
    if(firstName.length>100)return NextResponse.json({error:'ชื่อยาวเกินไป'},{status:422});
    if(!consent)return NextResponse.json({error:'กรุณายินยอมรับข่าวสารก่อนสมัคร'},{status:422});
    const result=await subscribeToNewsletter({email,firstName,consent,company});
    return NextResponse.json(result.data,{status:result.status});
  }catch(error){
    console.error('newsletter_proxy_failed',error);
    return NextResponse.json({error:'บริการรับข่าวสารยังไม่พร้อม กรุณาลองใหม่'},{status:503});
  }
}
