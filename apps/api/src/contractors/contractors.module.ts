import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';

@Module({ controllers: [ContractorsController], providers: [ContractorsService] })
export class ContractorsModule {}
