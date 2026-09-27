import {NextRequest,NextResponse} from 'next/server';
import type {ResultSetHeader,RowDataPacket} from 'mysql2';
import {getSessionUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {sendOrderConfirmationEmail} from '@/lib/newsletter';

type CartItem={productId:number;quantity:number};
type ProductRow=RowDataPacket&{id:number;name:string;sale_price:number|string;stock:number};

export async function GET(req:NextRequest){
  const user=await getSessionUser();
  if(!user)return NextResponse.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});
  const orderNumber=req.nextUrl.searchParams.get('orderNumber');
  const params:(string|number)[]=[user.id];
  let where='o.user_id = ?';
  if(user.role==='ADMIN'){
    where='1=1';
    params.length=0;
  }
  if(orderNumber){
    where+=' AND o.order_number = ?';
    params.push(orderNumber);
  }
  const[rows]=await db.execute<RowDataPacket[]>(
    `SELECT o.id,o.order_number,o.grand_total,o.status,o.payment_method,o.payment_reference,o.created_at,u.email
     FROM orders o JOIN users u ON u.id=o.user_id
     WHERE ${where} ORDER BY o.id DESC LIMIT 50`,
    params,
  );
  if(!rows.length)return NextResponse.json({data:[]});
  const orderIds=rows.map(row=>Number(row.id));
  const placeholders=orderIds.map(()=>'?').join(',');
  const[items]=await db.execute<RowDataPacket[]>(
    `SELECT order_id,product_id,product_name,price,quantity
     FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`,
    orderIds,
  );
  const itemsByOrder=new Map<number,RowDataPacket[]>();
  for(const item of items){
    const id=Number(item.order_id);
    itemsByOrder.set(id,[...(itemsByOrder.get(id)||[]),item]);
  }
  return NextResponse.json({data:rows.map(row=>({...row,items:itemsByOrder.get(Number(row.id))||[]}))});
}

export async function POST(req:NextRequest){
  const user=await getSessionUser();
  if(!user)return NextResponse.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});

  const body=await req.json().catch(()=>null) as {
    items?:CartItem[];
    addressId?:number;
    coupon?:string;
    paymentMethod?:string;
    paymentProvider?:string;
  }|null;
  const items=Array.isArray(body?.items)
    ?body.items.filter(item=>Number.isInteger(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0)
    :[];
  if(!items.length)return NextResponse.json({error:'ตะกร้าว่างเปล่า'},{status:400});

  const paymentMethod=String(body?.paymentMethod||'');
  const allowedPayments=['PROMPTPAY','CARD','WALLET'];
  if(!allowedPayments.includes(paymentMethod)){
    return NextResponse.json({error:'กรุณาเลือกวิธีชำระเงินที่รองรับ'},{status:400});
  }

  if(body?.addressId){
    const[addresses]=await db.execute<RowDataPacket[]>(
      'SELECT id FROM addresses WHERE id = ? AND user_id = ? LIMIT 1',
      [body.addressId,user.id],
    );
    if(!addresses.length)return NextResponse.json({error:'ไม่พบที่อยู่จัดส่ง'},{status:400});
  }else{
    return NextResponse.json({error:'กรุณาเลือกที่อยู่จัดส่ง'},{status:400});
  }

  const ids=[...new Set(items.map(item=>item.productId))];
  const placeholders=ids.map(()=>'?').join(',');
  const[products]=await db.execute<ProductRow[]>(
    `SELECT id,name,COALESCE(discount_price,price) AS sale_price,stock
     FROM products WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
    ids,
  );
  if(products.length!==ids.length){
    return NextResponse.json({error:'มีสินค้าบางรายการไม่พร้อมจำหน่าย'},{status:400});
  }

  let total=0;
  for(const item of items){
    const product=products.find(candidate=>Number(candidate.id)===item.productId);
    if(!product||Number(product.stock)<item.quantity){
      return NextResponse.json({error:`สินค้า ${product?.name||''} มีไม่เพียงพอ`},{status:409});
    }
    total+=Number(product.sale_price)*item.quantity;
  }

  const discount=String(body?.coupon||'').toUpperCase()==='SMART10'?Math.round(total*.1):0;
  const shipping=total>=1500?0:80;
  const grandTotal=total-discount+shipping;
  const connection=await db.getConnection();

  try{
    await connection.beginTransaction();
    const stamp=new Date().toISOString().slice(0,10).replaceAll('-','');
    const orderNumber=`SH${stamp}${String(Date.now()).slice(-6)}`;
    const paymentReference=`PAY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const[result]=await connection.execute<ResultSetHeader>(
      'INSERT INTO orders (order_number,user_id,grand_total,status,payment_method,payment_reference) VALUES (?,?,?,?,?,?)',
      [orderNumber,user.id,grandTotal,'PAID',paymentMethod,paymentReference],
    );

    for(const item of items){
      const product=products.find(candidate=>Number(candidate.id)===item.productId)!;
      await connection.execute(
        'INSERT INTO order_items (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)',
        [result.insertId,item.productId,product.name,Number(product.sale_price),item.quantity],
      );
      await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ?',[item.quantity,item.productId]);
    }
    await connection.commit();

    let emailSent=false;
    try{
      const emailResult=await sendOrderConfirmationEmail({
        email:user.email,
        firstName:user.name,
        lastName:user.lastName,
        orderNumber,
        items:items.map(item=>{
          const product=products.find(candidate=>Number(candidate.id)===item.productId)!;
          return{name:String(product.name),quantity:item.quantity,price:Number(product.sale_price)};
        }),
        grandTotal,
        discount,
        shipping,
        paymentMethod,
        paymentReference,
      });
      emailSent=emailResult.ok;
      if(!emailResult.ok)console.error('order_confirmation_email_rejected',emailResult.status,emailResult.data);
    }catch(emailError){
      console.error('order_confirmation_email_failed',emailError);
    }

    return NextResponse.json({
      data:{orderNumber,status:'PAID',grandTotal,discount,paymentMethod,paymentReference,emailSent},
    },{status:201});
  }catch(error){
    await connection.rollback();
    console.error('order_create_failed',error);
    return NextResponse.json({error:'สร้างคำสั่งซื้อไม่สำเร็จ'},{status:500});
  }finally{
    connection.release();
  }
}
