import { Module } from '@nestjs/common';
import { FileService } from '../../common/file.service';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, FileService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
