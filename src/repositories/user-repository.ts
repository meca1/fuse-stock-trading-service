import { DatabaseService } from '../config/database';
import { IUser } from '../types/models/user';
import { UserRepositoryError } from '../utils/errors/repository-error';

/**
 * Repository for user-related database operations
 */
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Creates and initializes a new instance of UserRepository
   * @returns Promise with initialized UserRepository instance
   */
  public static async initialize(): Promise<UserRepository> {
    const dbService = await DatabaseService.getInstance();
    return new UserRepository(dbService);
  }

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
