import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecoveryMailer } from './recovery-mailer';

@Module({ controllers: [AuthController], providers: [AuthService,PasswordRecoveryService,RecoveryMailer], exports: [AuthService] })
export class AuthModule {}
