import {NextResponse} from 'next/server';
export async function POST(){const response=NextResponse.json({message:'ออกจากระบบแล้ว'});response.cookies.set('smart_home_session','',{httpOnly:true,sameSite:'lax',path:'/',maxAge:0});return response}

