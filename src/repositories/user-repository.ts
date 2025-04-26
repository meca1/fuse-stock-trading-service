import { DatabaseService } from '../config/database';
import { IUser } from '../models/interfaces';
import { QueryResult, QueryResultRow } from 'pg';

export class UserRepository {
  private dbService: DatabaseService | null = null;

  private async getDbService(): Promise<DatabaseService> {
    if (!this.dbService) {
      this.dbService = await DatabaseService.getInstance();
    }
    return this.dbService;
  }

  /**
   * Encuentra un usuario por su ID
   */
  async findById(id: number): Promise<IUser | null> {
    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Encuentra un usuario por su email
   */
  async findByEmail(email: string): Promise<IUser | null> {
    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Crea un nuevo usuario
   */
  async create(user: Omit<IUser, 'id' | 'created_at' | 'updated_at'>): Promise<IUser> {
    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(
      `INSERT INTO users (name, email, password, is_active) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [user.name, user.email, user.password, user.is_active]
    );
    
    return result.rows[0];
  }

  /**
   * Actualiza un usuario existente
   */
  async update(id: number, user: Partial<Omit<IUser, 'id' | 'created_at' | 'updated_at'>>): Promise<IUser | null> {
    // Construir dinámicamente la consulta de actualización
    const keys = Object.keys(user);
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = Object.values(user);

    const query = `
      UPDATE users 
      SET ${setClauses.join(', ')}, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;

    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(query, [id, ...values]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Elimina un usuario por su ID
   */
  async delete(id: number): Promise<boolean> {
    const dbService = await this.getDbService();
    const result = await dbService.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Lista todos los usuarios
   */
  async findAll(limit = 100, offset = 0): Promise<IUser[]> {
    const dbService = await this.getDbService();
    const result = await dbService.query<IUser>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    return result.rows;
  }

  /**
   * Cuenta el número total de usuarios
   */
  async count(): Promise<number> {
    const dbService = await this.getDbService();
    const result = await dbService.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users'
    );
    
    return parseInt(result.rows[0].count, 10);
  }
}
