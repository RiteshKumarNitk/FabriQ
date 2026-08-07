import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Permissions('notification:read')
  list(@Query() query: ListQueryDto, @Query('isRead') isRead?: string) {
    return this.notifications.listMine(query, isRead === 'true' ? true : isRead === 'false' ? false : undefined);
  }

  @Get('unread-count')
  @Permissions('notification:read')
  unreadCount() {
    return this.notifications.unreadCount();
  }

  @Patch(':id/read')
  @Permissions('notification:read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Post('read-all')
  @Permissions('notification:read')
  markAllRead() {
    return this.notifications.markAllRead();
  }
}
