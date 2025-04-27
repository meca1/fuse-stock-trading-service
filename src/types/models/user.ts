export interface IUser {
  id: number;
  name: string;
  email: string;
  password?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
} 