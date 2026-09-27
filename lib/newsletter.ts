type NewsletterInput={
  email:string;
  firstName?:string;
  consent:boolean;
  company?:string;
};

export async function subscribeToNewsletter(input:NewsletterInput){
  const endpoint=process.env.NEWSLETTER_SERVICE_URL||'http://newsletter/subscribe.php';
  const secret=process.env.NEWSLETTER_SHARED_SECRET||'local-newsletter-secret-change-me';
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','x-newsletter-secret':secret},
    body:JSON.stringify(input),
    cache:'no-store',
    signal:AbortSignal.timeout(15000),
  });
  const data=await response.json().catch(()=>({error:'บริการอีเมลตอบกลับไม่ถูกต้อง'}));
  return {ok:response.ok,status:response.status,data};
}

export async function sendMemberWelcomeEmail(input:{email:string;firstName?:string;lastName?:string}){
  const endpoint=process.env.MEMBER_EMAIL_SERVICE_URL||'http://newsletter/member-welcome.php';
  const secret=process.env.NEWSLETTER_SHARED_SECRET||'local-newsletter-secret-change-me';
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','x-newsletter-secret':secret},
    body:JSON.stringify(input),
    cache:'no-store',
    signal:AbortSignal.timeout(15000),
  });
  const data=await response.json().catch(()=>({error:'บริการอีเมลตอบกลับไม่ถูกต้อง'}));
  return {ok:response.ok,status:response.status,data};
}

export type OrderConfirmationInput={
  email:string;
  firstName:string;
  lastName:string;
  orderNumber:string;
  items:{name:string;quantity:number;price:number}[];
  grandTotal:number;
  discount:number;
  shipping:number;
  paymentMethod:string;
  paymentReference:string;
};

export async function sendOrderConfirmationEmail(input:OrderConfirmationInput){
  const endpoint=process.env.ORDER_EMAIL_SERVICE_URL||'http://newsletter/order-confirmation.php';
  const secret=process.env.NEWSLETTER_SHARED_SECRET||'local-newsletter-secret-change-me';
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json','x-newsletter-secret':secret},
    body:JSON.stringify(input),
    cache:'no-store',
    signal:AbortSignal.timeout(15000),
  });
  const data=await response.json().catch(()=>({error:'บริการอีเมลตอบกลับไม่ถูกต้อง'}));
  return {ok:response.ok,status:response.status,data};
}
