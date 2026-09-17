import {redirect} from 'next/navigation';
import StoreApp from '../store-app';
import AdminWorkspace from '../admin-workspace';
import {getSessionUser} from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function CatchAll({params}:{params:Promise<{slug:string[]}>}){
 const{slug}=await params;const path=`/${slug.join('/')}`;const user=await getSessionUser();
 if(['/profile','/checkout'].includes(path)||path.startsWith('/orders/')){if(!user)redirect(`/login?error=required&returnTo=${encodeURIComponent(path)}`)}
 if(path==='/admin'||path.startsWith('/admin/')){
  if(user?.role!=='ADMIN')redirect(user?'/':'/login?error=required&returnTo=/admin');
  return <AdminWorkspace path={path} user={user}/>;
 }
 if(path==='/login'&&user)redirect(user.role==='ADMIN'?'/admin':'/profile');
 return <StoreApp path={path} user={user}/>;
}
