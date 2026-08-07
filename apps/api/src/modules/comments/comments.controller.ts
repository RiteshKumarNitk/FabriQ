import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @Permissions('notification:read')
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.comments.list(entityType, entityId);
  }

  @Post()
  @Permissions('notification:read')
  create(@Body() dto: CreateCommentDto) {
    return this.comments.create(dto);
  }

  @Delete(':id')
  @Permissions('notification:read')
  remove(@Param('id') id: string) {
    return this.comments.remove(id);
  }
}
