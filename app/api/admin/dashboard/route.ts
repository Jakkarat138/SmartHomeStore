import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
export async function GET(){
 if(!await requireAdmin())return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});
 try{
  const[[stats],[users],[orders],[products],[monthly]]=await Promise.all([
   db.execute<RowDataPacket[]>(`SELECT
    (SELECT COUNT(*) FROM users WHERE role='USER' AND email NOT LIKE '%@deleted.invalid') AS customers,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COALESCE(SUM(grand_total),0) FROM orders WHERE status IN ('PAID','PREPARING','SHIPPING','DELIVERED')) AS revenue,
    (SELECT COUNT(*) FROM products WHERE stock<10 AND status='ACTIVE') AS low_stock,
    (SELECT COUNT(*) FROM orders WHERE status IN ('PAID','PREPARING')) AS awaiting_dispatch,
    (SELECT COUNT(*) FROM orders WHERE status='PENDING_PAYMENT') AS awaiting_payment,
    (SELECT COUNT(*) FROM orders WHERE status='DELIVERED') AS delivered`),
   db.execute<RowDataPacket[]>("SELECT id,username,first_name,last_name,email,role,status,created_at FROM users WHERE role='ADMIN' OR email NOT LIKE '%@deleted.invalid' ORDER BY id DESC"),
   db.execute<RowDataPacket[]>(`SELECT o.id,o.order_number,o.grand_total,o.status,o.payment_method,o.payment_reference,o.created_at,u.email,CONCAT(u.first_name,' ',u.last_name) AS customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`),
   db.execute<RowDataPacket[]>('SELECT id,sku,name,category,stock,status,price,discount_price FROM products ORDER BY id DESC'),
   db.execute<RowDataPacket[]>(`SELECT DATE_FORMAT(created_at,'%Y-%m') AS month,COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status IN ('PAID','PREPARING','SHIPPING','DELIVERED') THEN grand_total ELSE 0 END),0) AS revenue FROM orders GROUP BY month ORDER BY month DESC LIMIT 6`)
  ]);
  return NextResponse.json({stats:stats[0],users,orders,products,monthly});
 }catch{return NextResponse.json({error:'โหลดข้อมูลหลังบ้านไม่สำเร็จ กรุณาลองอีกครั้ง'},{status:500})}
}
