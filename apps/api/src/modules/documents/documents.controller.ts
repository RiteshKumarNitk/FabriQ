import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { DocumentCategory } from '@fabriq/shared';
import { Permissions } from '../../common/decorators';
import { DocumentsService, MAX_FILE_SIZE } from './documents.service';
import { UploadDocumentDto } from './dto/document.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload')
  @Permissions('document:create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  upload(
    @UploadedFile() file: any,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(file, dto.entityType, dto.entityId, dto.category as DocumentCategory);
  }

  @Get()
  @Permissions('document:read')
  list(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.documents.list(entityType, entityId);
  }

  @Get(':id/download')
  @Permissions('document:read')
  async download(@Param('id') id: string) {
    const { data, mimeType, fileName } = await this.documents.download(id);
    return new StreamableFile(data, {
      type: mimeType,
      disposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
  }

  @Delete(':id')
  @Permissions('document:delete')
  archive(@Param('id') id: string) {
    return this.documents.archive(id);
  }
}
