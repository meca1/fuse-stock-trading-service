import { DatabaseService } from '../config/database';
import { IUser } from '../types/models/user';

export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Finds a user by their unique ID.
   * @param id - The user ID to search for.
   * @returns The user object if found, or null if not found.
   */
  async findById(id: string): Promise<IUser | null> {
    const result = await this.db.query<IUser>('SELECT * FROM users WHERE id = $1', [id]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
