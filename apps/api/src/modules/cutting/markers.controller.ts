import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { MarkersService } from './markers.service';
import { CreateMarkerDto, FinalizeMarkerDto, MarkerListQueryDto, MarkerPieceDto, UpdateMarkerDto } from './dto/marker.dto';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller('markers')
export class MarkersController {
  constructor(private readonly markers: MarkersService) {}

  @Get()
  @Permissions('marker:read')
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.markers.list({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('plan-calculator')
  @Permissions('cutorder:create')
  planCalculator(
    @Body()
    dto: {
      required: Record<string, number>;
      ply: number;
      candidates: Array<{ markerId: string; lays?: number }>;
    },
  ) {
    return this.markers.planCalculator(dto);
  }

  @Get(':id')
  @Permissions('marker:read')
  get(@Param('id') id: string) {
    return this.markers.getById(id);
  }

  @Post()
  @Permissions('marker:create')
  create(@Body() dto: CreateMarkerDto) {
    return this.markers.create(dto);
  }

  @Patch(':id')
  @Permissions('marker:update')
  update(@Param('id') id: string, @Body() dto: UpdateMarkerDto) {
    return this.markers.update(id, dto);
  }

  @Post(':id/duplicate')
  @Permissions('marker:create')
  duplicate(@Param('id') id: string) {
    return this.markers.duplicate(id);
  }

  @Post(':id/finalize')
  @Permissions('marker:update')
  finalize(@Param('id') id: string, @Body() dto: FinalizeMarkerDto) {
    return this.markers.finalize(id, dto);
  }

  @Post(':id/archive')
  @Permissions('marker:delete')
  archive(@Param('id') id: string) {
    return this.markers.archive(id);
  }

  @Patch(':id/pieces')
  @Permissions('marker:update')
  replacePieces(@Param('id') id: string, @Body() dto: { pieces: MarkerPieceDto[] }) {
    return this.markers.update(id, { pieces: dto.pieces });
  }
}
