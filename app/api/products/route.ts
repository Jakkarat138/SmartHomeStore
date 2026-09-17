import {NextRequest,NextResponse} from 'next/server';
import type {ResultSetHeader,RowDataPacket} from 'mysql2';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';

const rooms=['ห้องนอน','ห้องนั่งเล่น','ห้องครัว','ห้องน้ำ','ห้องทำงาน','หน้าบ้าน'] as const;
const imageBySku:Record<string,string>={
  'LUMA-E27':'/products/smart-bulb.png','AEGIS-2K':'/products/smart-camera.jpg','NEXA-PRO':'/products/smart-lock.png','TAPO-P100':'/products/smart-plug.jpg',
  'HUE-LS-V4':'/products/hue-lightstrip.png','AQARA-T1M':'/products/aqara-ceiling-light.png','NEST-MINI':'/products/google-nest-mini.webp',
  'MI-AIR-4C':'/products/xiaomi-air-purifier.png','SWB-CURTAIN3':'/products/switchbot-curtain.jpg','MI-AFRY-35':'/products/xiaomi-air-fryer.jpg',
  'AQARA-TH':'/products/aqara-temperature.jpg','AQARA-LEAK':'/products/aqara-water-leak.jpg','MI-SCALE2':'/products/xiaomi-smart-scale.jpg',
  'ECHO-DOT5':'/products/echo-dot-5.jpg','RING-DB2':'/products/ring-video-doorbell.png',
  'HUE-A60-WA':'/products/hue-a60-wa.jpg','TAPO-L530E':'/products/tapo-l530e.png','WIZ-A60':'/products/wiz-a60.jpg',
  'TAPO-C220':'/products/tapo-c220.png','MI-CAM-C300':'/products/mi-camera-c300.png',
  'YALE-LINUS':'/products/yale-linus.jpg','AQARA-U100':'/products/aqara-u100.png',
  'TAPO-P110M':'/products/tapo-p110m.jpg','MI-PLUG2':'/products/mi-plug-2.png',
  'NEST-AUDIO':'/products/nest-audio.jpg','ECHO-POP':'/products/echo-pop.jpg',
  'AQARA-FP2':'/products/aqara-fp2.png','TAPO-T310':'/products/tapo-t310.png','EVE-MOTION':'/products/eve-motion.jpg',
  'MI-AIR-4L':'/products/mi-air-4-lite.png','MI-FAN-2P':'/products/mi-fan-2-pro.jpg',
  'SWB-BLIND':'/products/switchbot-blind-tilt.jpg','MI-AFRY-45':'/products/mi-air-fryer-45.png','MI-KETTLE-PRO':'/products/mi-kettle-pro.png',
  'AQARA-G4':'/products/aqara-g4.png'
};
function normalize(row:RowDataPacket){return{id:Number(row.id),sku:String(row.sku),name:String(row.name),description:String(row.description||''),category:String(row.category),brand:String(row.brand),price:Number(row.discount_price||row.price),old:Number(row.price),stock:Number(row.stock),rating:Number(row.rating),status:String(row.status),image:imageBySku[String(row.sku)]||'/smart-home-store-logo.png',room:String(row.room||'ห้องนั่งเล่น')}}
export async function GET(req:NextRequest){const q=req.nextUrl.searchParams.get('q')?.trim()||'',category=req.nextUrl.searchParams.get('category')?.trim()||'';const[rows]=await db.execute<RowDataPacket[]>('SELECT id,sku,name,description,price,discount_price,category,brand,room,stock,rating,status FROM products WHERE status = \'ACTIVE\' AND (? = \'\' OR name LIKE CONCAT(\'%\',?,\'%\') OR brand LIKE CONCAT(\'%\',?,\'%\')) AND (? = \'\' OR category = ?) ORDER BY id',[q,q,q,category,category]);return NextResponse.json({data:rows.map(normalize),meta:{total:rows.length}})}
export async function POST(req:NextRequest){if(!await requireAdmin())return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});const body=await req.json().catch(()=>null) as Record<string,unknown>|null;const sku=String(body?.sku||'').trim().toUpperCase(),name=String(body?.name||'').trim(),description=String(body?.description||'').trim(),category=String(body?.category||'').trim(),brand=String(body?.brand||'').trim(),room=String(body?.room||'ห้องนั่งเล่น').trim(),price=Number(body?.price),stock=Number(body?.stock);if(!sku||!name||!description||!category||!brand||!rooms.includes(room as typeof rooms[number])||!Number.isFinite(price)||price<=0||!Number.isInteger(stock)||stock<0)return NextResponse.json({error:'กรุณากรอกข้อมูลสินค้าให้ถูกต้อง'},{status:400});try{const[result]=await db.execute<ResultSetHeader>('INSERT INTO products (sku,name,description,price,discount_price,category,brand,room,stock,rating,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[sku,name,description,price,null,category,brand,room,stock,0,'ACTIVE']);return NextResponse.json({message:'เพิ่มสินค้าแล้ว',id:result.insertId},{status:201})}catch{return NextResponse.json({error:'SKU ซ้ำหรือบันทึกสินค้าไม่ได้'},{status:409})}}
export async function DELETE(req:NextRequest){if(!await requireAdmin())return NextResponse.json({error:'เฉพาะผู้ดูแลระบบ'},{status:403});const id=Number(req.nextUrl.searchParams.get('id'));if(!Number.isInteger(id)||id<1)return NextResponse.json({error:'รหัสสินค้าไม่ถูกต้อง'},{status:400});const[result]=await db.execute<ResultSetHeader>('UPDATE products SET status = \'INACTIVE\' WHERE id = ?',[id]);return result.affectedRows?NextResponse.json({message:'ปิดการขายสินค้าแล้ว'}):NextResponse.json({error:'ไม่พบสินค้า'},{status:404})}
