import { Injectable, OnModuleDestroy } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

export function recoveryMailConfig(env:NodeJS.ProcessEnv=process.env){
 const port=Number(env.MOSTAOFI_SMTP_PORT||587),from=env.MOSTAOFI_MAIL_FROM||'';
 const host=env.MOSTAOFI_SMTP_HOST||'',user=env.MOSTAOFI_SMTP_USER||'',pass=env.MOSTAOFI_SMTP_PASSWORD||'';
 let origin:string;try{const url=new URL(env.MOSTAOFI_RECOVERY_ORIGIN||'');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash) return null;origin=url.origin}catch{return null}
 if(!host||!user||!pass||![465,587].includes(port)||!/^\S+@[^\s@<>]+\.[^\s@<>]+$/.test(from)||/[\r\n]/.test(host+user+from))return null;
 // Reuse a high-entropy runtime secret with domain separation for the mail queue.
 if(!env.JWT_REFRESH_SECRET||env.JWT_REFRESH_SECRET.length<32)return null;
 return {origin,from,options:{host,port,secure:port===465,requireTLS:true,auth:{user,pass},tls:{rejectUnauthorized:true},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,dnsTimeout:5000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true}};
}
@Injectable()
export class RecoveryMailer implements OnModuleDestroy {
 private transport?:Transporter;
 ready(){return recoveryMailConfig()!==null}
 async send(email:string,kind:'RESET'|'NOTICE',token?:string){
  const config=recoveryMailConfig();if(!config)throw Error('RECOVERY_UNAVAILABLE');
  this.transport??=nodemailer.createTransport(config.options);
  const link=kind==='RESET'?config.origin+'/#reset='+token:'';
  const text=kind==='RESET'?`طلب استعادة كلمة المرور في مستوفي\n\nافتح الرابط التالي واختر كلمة مرور جديدة خلال 15 دقيقة:\n${link}\n\nإذا لم تطلب الاستعادة فتجاهل هذه الرسالة. لن تتغير كلمة المرور إلا عند استخدام الرابط. لا تشارك الرابط مع الآخرين.`:`تغيرت كلمة مرور حسابك في مستوفي، وأُبطلت جلسات الدخول السابقة.\n\nإذا لم تقم بهذا التغيير فاطلب استعادة الحساب فورًا من ${config.origin}/live/ وتواصل مع مسؤول منشأتك.`;
  const info=await this.transport.sendMail({from:config.from,to:email,subject:kind==='RESET'?'مستوفي | استعادة كلمة المرور':'مستوفي | تغيير كلمة المرور',text,disableFileAccess:true,disableUrlAccess:true});
  if(!info.accepted?.length)throw Error('MAIL_NOT_ACCEPTED');
 }
 onModuleDestroy(){this.transport?.close()}
}
