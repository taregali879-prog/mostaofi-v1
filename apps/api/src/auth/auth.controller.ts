import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from '../security/auth.decorators';
@Controller('auth') export class AuthController{
 constructor(private auth:AuthService){}
 @Public() @Post('login') login(@Body() b:{email:string,password:string},@Headers('x-request-id') r?:string){return this.auth.login(b.email,b.password,r)}
 @Public() @Post('refresh') refresh(@Body() b:{refreshToken:string}){return this.auth.refresh(b.refreshToken)}
 @Get('/me') me(@CurrentUser() u:any){return this.auth.me(u)}
}
