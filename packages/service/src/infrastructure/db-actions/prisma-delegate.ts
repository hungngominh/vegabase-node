export interface PrismaDelegate<T> {
  create(args: { data: Record<string, unknown> }): Promise<T>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<T>;
  findMany(args?: {
    where?: Record<string, unknown>;
    skip?: number;
    take?: number;
    orderBy?: Record<string, unknown>;
  }): Promise<T[]>;
  findUnique(args: { where: { id: string } }): Promise<T | null>;
  findFirst(args: { where: Record<string, unknown> }): Promise<T | null>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
}
