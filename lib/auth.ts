import {createHmac, timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {eq} from 'drizzle-orm';
import {getDb} from '@/db';
import {users} from '@/db/schema';

export type SessionUser = {id:number;email:string;name:string;lastName:string;phone:string;role:'USER'|'ADMIN'};
type TokenPayload = {id:number;exp:number};

function getSecret(){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error('SESSION_SECRET must contain at least 32 characters');return secret}

export function createSessionToken(userId:number){const payload=Buffer.from(JSON.stringify({id:userId,exp:Date.now()+7*24*60*60*1000})).toString('base64url');const signature=createHmac('sha256',getSecret()).update(payload).digest('base64url');return `${payload}.${signature}`}

function verifyToken(token:string):TokenPayload|null{const[payload,signature]=token.split('.');if(!payload||!signature)return null;const expected=createHmac('sha256',getSecret()).update(payload).digest('base64url');const actualBuffer=Buffer.from(signature),expectedBuffer=Buffer.from(expected);if(actualBuffer.length!==expectedBuffer.length||!timingSafeEqual(actualBuffer,expectedBuffer))return null;try{const parsed=JSON.parse(Buffer.from(payload,'base64url').toString()) as TokenPayload;return Number.isInteger(parsed.id)&&parsed.exp>Date.now()?parsed:null}catch{return null}}

export async function getSessionUser():Promise<SessionUser|null>{try{const token=(await cookies()).get('smart_home_session')?.value;if(!token)return null;const payload=verifyToken(token);if(!payload)return null;const rows=await getDb().select({id:users.id,email:users.email,name:users.firstName,lastName:users.lastName,phone:users.phone,role:users.role,status:users.status}).from(users).where(eq(users.id,payload.id)).limit(1);const user=rows[0];if(!user||user.status!=='ACTIVE')return null;return{id:user.id,email:user.email,name:user.name,lastName:user.lastName,phone:user.phone||'',role:user.role}}catch(error){console.error('session_read_failed',error);return null}}

export async function requireAdmin(){const user=await getSessionUser();return user?.role==='ADMIN'?user:null}

