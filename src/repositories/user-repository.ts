import { DatabaseService } from '../config/database';
import { IUser } from '../types/models/user';

export class UserRepository {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Finds a user by their ID
   * @param id User ID
   * @returns User object or null if not found
   */
  async findById(id: string): Promise<IUser | null> {
    const result = await this.dbService.query<IUser>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
