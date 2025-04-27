import { DatabaseService } from '../config/database';
import { IUser } from '../types/models/user';

export class UserRepository {
  private dbService: DatabaseService | null = null;

  private async getDbService(): Promise<DatabaseService> {
    if (!this.dbService) {
      this.dbService = await DatabaseService.getInstance();
    }
    return this.dbService;
  }

  /**
   * Finds a user by their ID
   * @param id User ID
   * @returns User object or null if not found
   */
  async findById(id: number): Promise<IUser | null> {
    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
