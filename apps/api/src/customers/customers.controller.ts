import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrg, JwtAuthGuard } from '@supportops/auth';
import { PageQueryDto, type Paginated } from '../common/pagination.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import type { CustomerDto } from './dto/customer.dto.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentOrg() orgId: string, @Query() query: PageQueryDto): Promise<Paginated<CustomerDto>> {
    return this.customers.list(orgId, query);
  }

  @Get(':id')
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    return this.customers.get(orgId, id);
  }

  @Post()
  create(@CurrentOrg() orgId: string, @Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customers.create(orgId, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customers.remove(orgId, id);
  }
}
