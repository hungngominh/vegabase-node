export interface BaseEntity {
  id: string;
  isDeleted: boolean;
  logCreatedDate: Date;
  logCreatedBy: string;
  logUpdatedDate: Date | null;
  logUpdatedBy: string | null;
}
