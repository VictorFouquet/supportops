import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Standard query parameters for a paged list. Extend per resource if extra filters are needed. */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  q?: string;
}

/** The envelope every list endpoint returns. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Turn a count + windowed findMany into a Paginated envelope. */
export async function paginate<T>(
  query: { page: number; pageSize: number },
  source: {
    count: () => Promise<number>;
    findMany: (args: { skip: number; take: number }) => Promise<T[]>;
  },
): Promise<Paginated<T>> {
  const { page, pageSize } = query;
  const [total, data] = await Promise.all([
    source.count(),
    source.findMany({ skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { data, page, pageSize, total };
}
