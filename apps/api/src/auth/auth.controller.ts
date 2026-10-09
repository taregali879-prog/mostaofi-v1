import { Body, Controller, Get, Headers, Post, Req, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { CurrentUser, Public } from '../security/auth.decorators';
const attempts=new Map<string,{count:number,end:number}>();
function limit(key:string){const now=Date.now();if(attempts.size>10000)for(const [k,v]of attempts)if(v.end<now)attempts.delete(k);if(attempts.size>10000)throw new HttpException('TRY_LATER',429);const old=attempts.get(key);const value=!old||old.end<now?{count:0,end:now+60000}:old;value.count++;attempts.set(key,value);if(value.count>10)throw new HttpException('TRY_LATER',429);}
@Controller('auth') export class AuthController{
 constructor(private auth:AuthService,private recovery:PasswordRecoveryService){}
 @Public() @Get('recovery/status') recoveryStatus(){return this.recovery.status()}
 @Public() @Post('forgot-password') forgot(@Body() b:any,@Req() req:any){return this.recovery.forgot(b,this.recovery.clientIP(req))}
 @Public() @Post('recovery-token') validateRecovery(@Body() b:any,@Req() req:any){return this.recovery.validate(b,this.recovery.clientIP(req))}
 @Public() @Post('reset-password') reset(@Body() b:any,@Req() req:any,@Headers('x-request-id') r?:string){return this.recovery.reset(b,this.recovery.clientIP(req),r||'password-reset')}
 @Public() @Post('login') login(@Body() b:{email:string,password:string},@Req() req:any,@Headers('x-request-id') r?:string){limit('login:'+String(req.ip));return this.auth.login(b?.email,b?.password,r)}
 @Public() @Post('register') register(@Body() b:any,@Req() req:any,@Headers('x-registration-key') key:string){limit('register:'+String(req.ip));return this.auth.register(b??{},key)}
 @Public() @Post('refresh') refresh(@Body() b:{refreshToken:string},@Req() req:any){limit('refresh:'+String(req.ip));return this.auth.refresh(b?.refreshToken)}
 @Get('/me') me(@CurrentUser() u:any){return this.auth.me(u)}
}
