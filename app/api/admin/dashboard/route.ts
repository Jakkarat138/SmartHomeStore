import {and,count,desc,eq,inArray,notLike,sql,sum} from 'drizzle-orm';
import {NextResponse} from 'next/server';
import {getDb} from '@/db';
import {orders,payments,products,categories,users} from '@/db/schema';
import {requireAdmin} from '@/lib/auth';

const revenueStatuses=['PAID','PREPARING','SHIPPING','DELIVERED'];

export async function GET(){
 if(!await requireAdmin())return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});
 try{
  const database=getDb();
  const [customerCount,orderCount,revenue,lowStock,awaitingDispatch,awaitingPayment,delivered,memberRows,orderRows,productRows,monthlyRows]=await Promise.all([
   database.select({value:count()}).from(users).where(and(eq(users.role,'USER'),notLike(users.email,'%@deleted.invalid'))),
   database.select({value:count()}).from(orders),
   database.select({value:sum(orders.grandTotal)}).from(orders).where(inArray(orders.status,revenueStatuses)),
   database.select({value:count()}).from(products).where(and(eq(products.status,'ACTIVE'),sql`${products.stock} < 10`)),
   database.select({value:count()}).from(orders).where(inArray(orders.status,['PAID','PREPARING'])),
   database.select({value:count()}).from(orders).where(eq(orders.status,'PENDING_PAYMENT')),
   database.select({value:count()}).from(orders).where(eq(orders.status,'DELIVERED')),
   database.select({id:users.id,username:users.username,first_name:users.firstName,last_name:users.lastName,email:users.email,role:users.role,status:users.status,created_at:users.createdAt}).from(users).where(sql`${users.role} = 'ADMIN' OR ${users.email} NOT LIKE '%@deleted.invalid'`).orderBy(desc(users.id)),
   database.select({id:orders.id,order_number:orders.orderNumber,grand_total:orders.grandTotal,status:orders.status,payment_method:payments.method,payment_reference:payments.reference,created_at:orders.createdAt,email:users.email,customer_name:sql<string>`trim(${users.firstName} || ' ' || ${users.lastName})`}).from(orders).innerJoin(users,eq(users.id,orders.userId)).leftJoin(payments,eq(payments.orderId,orders.id)).orderBy(desc(orders.id)),
   database.select({id:products.id,sku:products.sku,name:products.name,category:categories.name,stock:products.stock,status:products.status,price:products.price,discount_price:products.discountPrice}).from(products).leftJoin(categories,eq(categories.id,products.categoryId)).orderBy(desc(products.id)),
   database.select({month:sql<string>`strftime('%Y-%m', ${orders.createdAt})`,orders:count(),revenue:sql<number>`coalesce(sum(case when ${orders.status} in ('PAID','PREPARING','SHIPPING','DELIVERED') then ${orders.grandTotal} else 0 end),0)`}).from(orders).groupBy(sql`strftime('%Y-%m', ${orders.createdAt})`).orderBy(desc(sql`strftime('%Y-%m', ${orders.createdAt})`)).limit(6),
  ]);
  return NextResponse.json({
   stats:{customers:customerCount[0]?.value??0,orders:orderCount[0]?.value??0,revenue:Number(revenue[0]?.value??0),low_stock:lowStock[0]?.value??0,awaiting_dispatch:awaitingDispatch[0]?.value??0,awaiting_payment:awaitingPayment[0]?.value??0,delivered:delivered[0]?.value??0},
   users:memberRows,
   orders:orderRows,
   products:productRows,
   monthly:monthlyRows,
  });
 }catch(error){
  console.error('admin_dashboard_load_failed',error);
  return NextResponse.json({error:'โหลดข้อมูลหลังบ้านไม่สำเร็จ กรุณาตรวจสอบ D1 และลองอีกครั้ง'},{status:500});
 }
}
