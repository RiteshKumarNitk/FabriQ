import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/pagination.dto';
import { PatternsService } from './patterns.service';
import { ApplyToMarkerDto, CreatePatternSetDto, UpdatePatternSetDto } from './dto/pattern.dto';

@ApiTags('cutting')
@ApiBearerAuth()
@Controller('pattern-sets')
export class PatternsController {
  constructor(private readonly patterns: PatternsService) {}

  @Get()
  @Permissions('pattern:read')
  list(@Query() query: ListQueryDto) {
    return this.patterns.list(query);
  }

  @Get(':id')
  @Permissions('pattern:read')
  get(@Param('id') id: string) {
    return this.patterns.getById(id);
  }

  @Get(':id/revisions')
  @Permissions('pattern:read')
  revisions(@Param('id') id: string) {
    return this.patterns.revisions(id);
  }

  @Post()
  @Permissions('pattern:create')
  create(@Body() dto: CreatePatternSetDto) {
    return this.patterns.create(dto);
  }

  @Patch(':id')
  @Permissions('pattern:update')
  update(@Param('id') id: string, @Body() dto: UpdatePatternSetDto) {
    return this.patterns.update(id, dto);
  }

  /** New revision = a new PatternSet row (v n+1) copying pieces; never an overwrite. */
  @Post(':id/revisions')
  @Permissions('pattern:create')
  createRevision(@Param('id') id: string, @Body() dto: { notes?: string }) {
    return this.patterns.createRevision(id, dto);
  }

  /** Stamp a draft marker's pieces from this pattern set. */
  @Post(':id/apply-to-marker')
  @Permissions('pattern:update')
  applyToMarker(@Param('id') id: string, @Body() dto: ApplyToMarkerDto) {
    return this.patterns.applyToMarker(id, dto);
  }

  @Post(':id/archive')
  @Permissions('pattern:delete')
  archive(@Param('id') id: string) {
    return this.patterns.archive(id);
  }
}
