import bcrypt from 'bcryptjs';
import type {RowDataPacket} from 'mysql2';
import {NextRequest,NextResponse} from 'next/server';
import {createSessionToken} from '@/lib/auth';
import {db} from '@/lib/db';

type UserRow=RowDataPacket&{id:number;password_hash:string;status:'ACTIVE'|'SUSPENDED';role:'USER'|'ADMIN'};
const redirect=(path:string)=>new NextResponse(null,{status:303,headers:{location:path}});

export async function POST(req:NextRequest){try{const form=await req.formData();const email=String(form.get('email')||'').trim().toLowerCase(),password=String(form.get('password')||''),requested=String(form.get('returnTo')||'/');const returnTo=requested.startsWith('/')&&!requested.startsWith('//')&&!requested.includes('\\')?requested:'/';if(!email||!password)return redirect('/login?error=missing');const[rows]=await db.execute<UserRow[]>('SELECT id,password_hash,status,role FROM users WHERE email = ? LIMIT 1',[email]);const user=rows[0];if(!user||user.status!=='ACTIVE'||!(await bcrypt.compare(password,user.password_hash)))return redirect('/login?error=invalid');const response=redirect(user.role==='ADMIN'?'/admin':returnTo);response.cookies.set('smart_home_session',createSessionToken(user.id),{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:7*24*60*60});return response}catch(error){console.error('login_failed',error);return redirect('/login?error=server')}}
