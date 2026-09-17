import {createHmac, timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import type {RowDataPacket} from 'mysql2';
import {db} from './db';

export type SessionUser = {id:number;email:string;name:string;lastName:string;phone:string;role:'USER'|'ADMIN'};
type TokenPayload = {id:number;exp:number};
type UserRow = RowDataPacket & {id:number;email:string;first_name:string;last_name:string;phone:string|null;role:'USER'|'ADMIN';status:'ACTIVE'|'SUSPENDED'};

function getSecret(){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error('SESSION_SECRET must contain at least 32 characters');return secret}

export function createSessionToken(userId:number){const payload=Buffer.from(JSON.stringify({id:userId,exp:Date.now()+7*24*60*60*1000})).toString('base64url');const signature=createHmac('sha256',getSecret()).update(payload).digest('base64url');return `${payload}.${signature}`}

function verifyToken(token:string):TokenPayload|null{const[payload,signature]=token.split('.');if(!payload||!signature)return null;const expected=createHmac('sha256',getSecret()).update(payload).digest('base64url');const actualBuffer=Buffer.from(signature),expectedBuffer=Buffer.from(expected);if(actualBuffer.length!==expectedBuffer.length||!timingSafeEqual(actualBuffer,expectedBuffer))return null;try{const parsed=JSON.parse(Buffer.from(payload,'base64url').toString()) as TokenPayload;return Number.isInteger(parsed.id)&&parsed.exp>Date.now()?parsed:null}catch{return null}}

export async function getSessionUser():Promise<SessionUser|null>{try{const token=(await cookies()).get('smart_home_session')?.value;if(!token)return null;const payload=verifyToken(token);if(!payload)return null;const[rows]=await db.execute<UserRow[]>('SELECT id,email,first_name,last_name,phone,role,status FROM users WHERE id = ? LIMIT 1',[payload.id]);const user=rows[0];if(!user||user.status!=='ACTIVE')return null;return{id:user.id,email:user.email,name:user.first_name,lastName:user.last_name,phone:user.phone||'',role:user.role}}catch(error){console.error('session_read_failed',error);return null}}

export async function requireAdmin(){const user=await getSessionUser();return user?.role==='ADMIN'?user:null}

