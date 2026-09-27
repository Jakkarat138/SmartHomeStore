import {NextRequest,NextResponse} from 'next/server';
import type {RowDataPacket,ResultSetHeader} from 'mysql2';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

function invalidOrigin(req:NextRequest){
 const origin=req.headers.get('origin');
 if(!origin)return false;
 try{return new URL(origin).host!==req.headers.get('host')}catch{return true}
}

export async function PATCH(req:NextRequest){
 const admin=await requireAdmin();if(!admin)return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});
 if(invalidOrigin(req))return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403});
 const body=await req.json().catch(()=>null) as {id:number;kind:string;status:string;stock:number}|null;
 if(!body||!Number.isSafeInteger(body.id)||body.id<1)return NextResponse.json({error:'ข้อมูลไม่ถูกต้อง'},{status:400});
 try{
  if(body.kind==='member'){
   if(!['ACTIVE','SUSPENDED'].includes(body.status))return NextResponse.json({error:'สถานะไม่ถูกต้อง'},{status:400});
   const[result]=await db.execute<ResultSetHeader>("UPDATE users SET status=? WHERE id=? AND role='USER'",[body.status,body.id]);
   return result.affectedRows?NextResponse.json({message:'บันทึกสถานะสมาชิกแล้ว'}):NextResponse.json({error:'ไม่พบสมาชิก หรือบัญชีนี้เป็นแอดมิน'},{status:409});
  }
  if(body.kind==='inventory'){
   if(!Number.isSafeInteger(body.stock)||body.stock<0||body.stock>1000000||!['ACTIVE','INACTIVE'].includes(body.status))return NextResponse.json({error:'กรุณาระบุสต็อกเป็นจำนวนเต็ม 0–1,000,000'},{status:400});
   const[result]=await db.execute<ResultSetHeader>('UPDATE products SET stock=?,status=? WHERE id=?',[body.stock,body.status,body.id]);
   return result.affectedRows?NextResponse.json({message:'บันทึกสต็อกและสถานะแล้ว'}):NextResponse.json({error:'ไม่พบสินค้า'},{status:404});
  }
  if(body.kind==='order'){
   const transitions:Record<string,string[]>={PENDING_PAYMENT:['CANCELLED'],PAID:['PREPARING','CANCELLED'],PREPARING:['SHIPPING','CANCELLED'],SHIPPING:['DELIVERED'],DELIVERED:[],CANCELLED:[]};
   const connection=await db.getConnection();
   try{
    await connection.beginTransaction();
    const[rows]=await connection.execute<RowDataPacket[]>('SELECT id,status FROM orders WHERE id=? FOR UPDATE',[body.id]);
    const order=rows[0];
    if(!order){await connection.rollback();return NextResponse.json({error:'ไม่พบคำสั่งซื้อ'},{status:404})}
    if(!transitions[order.status]?.includes(body.status)){await connection.rollback();return NextResponse.json({error:'เปลี่ยนสถานะนี้ไม่ได้ หรือข้อมูลถูกอัปเดตแล้ว กรุณาโหลดใหม่'},{status:409})}
    if(body.status==='CANCELLED'&&['PAID','PREPARING'].includes(order.status)){
     await connection.execute('UPDATE products p JOIN (SELECT product_id,SUM(quantity) AS qty FROM order_items WHERE order_id=? GROUP BY product_id) i ON i.product_id=p.id SET p.stock=p.stock+i.qty',[body.id]);
    }
    await connection.execute('UPDATE orders SET status=? WHERE id=?',[body.status,body.id]);
    await connection.commit();return NextResponse.json({message:body.status==='CANCELLED'?'ยกเลิกคำสั่งซื้อแล้ว (ระบบจำลอง)':'บันทึกสถานะคำสั่งซื้อแล้ว'});
   }catch(error){await connection.rollback();throw error}finally{connection.release()}
  }
  return NextResponse.json({error:'การทำงานไม่ถูกต้อง'},{status:400});
 }catch{return NextResponse.json({error:'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'},{status:500})}
}

export async function DELETE(req:NextRequest){
 const admin=await requireAdmin();
 if(!admin)return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});
 if(invalidOrigin(req))return NextResponse.json({error:'แหล่งคำขอไม่ถูกต้อง'},{status:403});
 const body=await req.json().catch(()=>null) as {id?:number}|null;
 if(!body||!Number.isSafeInteger(body.id)||Number(body.id)<1)return NextResponse.json({error:'ข้อมูลสมาชิกไม่ถูกต้อง'},{status:400});
 const memberId=Number(body.id);
 if(memberId===admin.id)return NextResponse.json({error:'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่'},{status:409});
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const[rows]=await connection.execute<RowDataPacket[]>('SELECT id,email,role FROM users WHERE id=? FOR UPDATE',[memberId]);
  const member=rows[0];
  if(!member){await connection.rollback();return NextResponse.json({error:'ไม่พบสมาชิก หรือบัญชีถูกลบแล้ว'},{status:404})}
  if(member.role!=='USER'){await connection.rollback();return NextResponse.json({error:'ไม่สามารถลบบัญชีผู้ดูแลระบบ'},{status:409})}
  await connection.execute('DELETE FROM newsletter_subscribers WHERE email=?',[member.email]);
  await connection.execute('DELETE FROM addresses WHERE user_id=?',[memberId]);
  const[result]=await connection.execute<ResultSetHeader>(`UPDATE users SET
   username=CONCAT('deleted_',id,'_',SUBSTRING(REPLACE(UUID(),'-',''),1,12)),
   email=CONCAT('deleted-',id,'-',SUBSTRING(REPLACE(UUID(),'-',''),1,12),'@deleted.invalid'),
   password_hash=CONCAT('deleted:',UUID()),first_name='สมาชิก',last_name='ที่ถูกลบ',phone=NULL,
   status='SUSPENDED',privacy_accepted_at=NULL,marketing_consent=FALSE,marketing_consent_at=NULL
   WHERE id=? AND role='USER'`,[memberId]);
  if(!result.affectedRows){await connection.rollback();return NextResponse.json({error:'ลบสมาชิกไม่สำเร็จ'},{status:409})}
  await connection.commit();
  return NextResponse.json({message:'ลบสมาชิกและข้อมูลส่วนตัวแล้ว'});
 }catch(error){
  await connection.rollback();
  console.error('delete_member_failed',error);
  return NextResponse.json({error:'ลบสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง'},{status:500});
 }finally{connection.release()}
}
