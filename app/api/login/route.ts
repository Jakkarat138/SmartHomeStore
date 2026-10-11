import bcrypt from 'bcryptjs';
import {eq} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {getDb} from '@/db';
import {users} from '@/db/schema';
import {createSessionToken} from '@/lib/auth';

const redirect=(path:string)=>new NextResponse(null,{status:303,headers:{location:path}});

export async function POST(req:NextRequest){try{const form=await req.formData();const email=String(form.get('email')||'').trim().toLowerCase(),password=String(form.get('password')||''),requested=String(form.get('returnTo')||'/');const returnTo=requested.startsWith('/')&&!requested.startsWith('//')&&!requested.includes('\\')?requested:'/';if(!email||!password)return redirect('/login?error=missing');const rows=await getDb().select({id:users.id,passwordHash:users.passwordHash,status:users.status,role:users.role}).from(users).where(eq(users.email,email)).limit(1);const user=rows[0];if(!user||user.status!=='ACTIVE'||!user.passwordHash||!(await bcrypt.compare(password,user.passwordHash)))return redirect('/login?error=invalid');const response=redirect(user.role==='ADMIN'?'/admin':returnTo);response.cookies.set('smart_home_session',createSessionToken(user.id),{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:7*24*60*60});return response}catch(error){console.error('login_failed',error);return redirect('/login?error=server')}}
