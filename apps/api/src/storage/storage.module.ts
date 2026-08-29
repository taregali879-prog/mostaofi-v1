import { Global, Module } from '@nestjs/common';
import { S3SignerService } from './s3-signer.service';
@Global() @Module({providers:[S3SignerService],exports:[S3SignerService]}) export class StorageModule {}
