// Run inside the app container: node < scripts/admin-smoke.mjs
// Creates isolated fixtures and always removes them. Never edits real accounts/orders.
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomBytes,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const db=await mysql.createConnection(process.env.DATABASE_URL);
const base='http://localhost:3000',tag='admtest'+randomBytes(5).toString('hex');
const ids={users:[],orders:[],product:0};let passed=0;
function check(ok,label){assert.ok(ok,label);passed++;console.log('PASS '+label)}
function token(id){const p=Buffer.from(JSON.stringify({id,exp:Date.now()+600000})).toString('base64url');return 'smart_home_session='+p+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(p).digest('base64url')}
async function request(path,cookie='',body){return fetch(base+path,{redirect:'manual',method:body?'PATCH':'GET',headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}
try{
 const password=randomBytes(18).toString('base64url');
 for(const role of ['ADMIN','USER']){const[r]=await db.execute('INSERT INTO users(username,password_hash,first_name,last_name,email,role) VALUES(?,?,?,?,?,?)',[tag+role,await bcrypt.hash(password,10),'Admin QA','Fixture',tag+role+'@example.invalid',role]);ids.users.push(r.insertId)}
 const admin=token(ids.users[0]),member=token(ids.users[1]);
 const loginPage=await request('/login');check(loginPage.status===200&&(await loginPage.text()).includes('auth-login'),'premium customer login renders');
 const productsPage=await request('/products');check(productsPage.status===200&&(await productsPage.text()).includes('product-card'),'premium product cards render');
 const profilePage=await request('/profile',member);check(profilePage.status===200&&(await profilePage.text()).includes('account-page'),'premium customer account renders');
 const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',body:new URLSearchParams({email:tag+'ADMIN@example.invalid',password,returnTo:'/cart'})});
 check(login.status===303&&login.headers.get('location')==='/admin','admin login redirects to its own dashboard');
 check((await request('/',admin)).headers.get('location')==='/admin','admin home redirects away from storefront');
 for(const path of ['/admin','/admin/orders','/admin/members','/admin/inventory','/admin/reports','/admin/account']){const r=await request(path,admin);const html=await r.text();check(r.status===200&&html.includes('admin-shell')&&!html.includes('class="promo-bar"'),path+' uses premium separate admin shell')}
 check((await request('/admin')).status===307,'guest cannot open admin');
 check((await request('/admin',member)).status===307,'customer cannot open admin');
 check((await request('/api/admin/dashboard')).status===403,'dashboard denies anonymous access');
 check((await request('/api/admin/dashboard',member)).status===403,'dashboard denies customer access');
 check((await request('/api/admin/manage',member,{kind:'member',id:ids.users[0],status:'SUSPENDED'})).status===403,'customer cannot mutate admin data');
 const dashboard=await request('/api/admin/dashboard',admin);const data=await dashboard.json();check(dashboard.status===200&&Array.isArray(data.monthly)&&Array.isArray(data.orders)&&data.stats,'dashboard data and reports load');
 check(!JSON.stringify(data).includes('password_hash'),'dashboard does not expose password hashes');
 check((await request('/api/admin/manage',admin,{kind:'member',id:ids.users[0],status:'SUSPENDED'})).status===409,'admin account protected against suspension');
 for(const status of ['SUSPENDED','ACTIVE']){check((await request('/api/admin/manage',admin,{kind:'member',id:ids.users[1],status})).status===200,'member status '+status);check((await request('/profile',member)).status===(status==='SUSPENDED'?307:200),'member session respects '+status)}
 for(const [label,cookie,email] of [['admin',admin,tag+'ADMIN@example.invalid'],['member',member,tag+'USER@example.invalid']]){
  check((await request('/api/account/password',cookie,{currentPassword:'wrong-password',newPassword:'NewPassword123',confirmPassword:'NewPassword123'})).status===400,label+' password requires current password');
  check((await request('/api/account/password',cookie,{currentPassword:password,newPassword:'12345678',confirmPassword:'12345678'})).status===400,label+' weak password rejected');
  check((await request('/api/account/password',cookie,{currentPassword:password,newPassword:'NewPassword123',confirmPassword:'Different123'})).status===400,label+' password confirmation checked');
  const changed=await request('/api/account/password',cookie,{currentPassword:password,newPassword:'NewPassword123',confirmPassword:'NewPassword123'});check(changed.status===200,label+' password changed');
  const oldLogin=await fetch(base+'/api/login',{method:'POST',redirect:'manual',body:new URLSearchParams({email,password})});check(oldLogin.headers.get('location')==='/login?error=invalid',label+' old password rejected');
  const newLogin=await fetch(base+'/api/login',{method:'POST',redirect:'manual',body:new URLSearchParams({email,password:'NewPassword123'})});check(newLogin.headers.get('location')===(label==='admin'?'/admin':'/'),label+' new password signs in');
 }
 const[product]=await db.execute('INSERT INTO products(sku,name,price,category,brand,stock,status) VALUES(?,?,?,?,?,?,?)',[tag,'Admin QA fixture',100,'QA','QA',8,'INACTIVE']);ids.product=product.insertId;
 check((await request('/api/admin/manage',admin,{kind:'inventory',id:ids.product,stock:-1,status:'INACTIVE'})).status===400,'negative stock rejected');
 check((await request('/api/admin/manage',admin,{kind:'inventory',id:ids.product,stock:8,status:'INACTIVE'})).status===200,'stock and sale status saved');
 for(let n=0;n<2;n++){const[o]=await db.execute('INSERT INTO orders(order_number,user_id,grand_total,status,payment_method) VALUES(?,?,?, ?,?)',[tag+n,ids.users[1],200,'PAID','CARD']);ids.orders.push(o.insertId);await db.execute('INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)',[o.insertId,ids.product,'Admin QA fixture',100,2])}
 for(const status of ['PREPARING','SHIPPING','DELIVERED'])check((await request('/api/admin/manage',admin,{kind:'order',id:ids.orders[0],status})).status===200,'order transition '+status);
 check((await request('/api/admin/manage',admin,{kind:'order',id:ids.orders[0],status:'PAID'})).status===409,'backward status transition rejected');
 check((await request('/api/admin/manage',admin,{kind:'order',id:ids.orders[1],status:'CANCELLED'})).status===200,'cancel paid order');
 check((await request('/api/admin/manage',admin,{kind:'order',id:ids.orders[1],status:'CANCELLED'})).status===409,'double cancellation rejected');
 const[[stock]]=await db.execute('SELECT stock FROM products WHERE id=?',[ids.product]);check(stock.stock===10,'cancel restores stock exactly once');
 console.log('All '+passed+' checks passed.');
}finally{
 for(const id of ids.orders)await db.execute('DELETE FROM orders WHERE id=?',[id]);
 if(ids.product)await db.execute('DELETE FROM products WHERE id=?',[ids.product]);
 for(const id of ids.users)await db.execute('DELETE FROM users WHERE id=?',[id]);
 await db.end();console.log('Temporary QA fixtures removed.');
}
