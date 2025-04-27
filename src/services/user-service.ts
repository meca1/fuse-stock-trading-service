import { DatabaseService } from '../config/database';
import { UserRepository } from '../repositories/user-repository';

// Import the IUser interface to ensure consistency
import { IUser } from '../models/interfaces';

// Use IUser as our User type
type User = IUser;

// DTO para crear un usuario
interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  is_active?: boolean;
}

// DTO para actualizar un usuario
interface UpdateUserDTO {
  name?: string;
  email?: string;
  password?: string;
  is_active?: boolean;
}

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Obtiene un usuario por su ID
   */
  async getUserById(id: number): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  /**
   * Obtiene un usuario por su email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  /**
   * Crea un nuevo usuario
   */
  async createUser(userData: CreateUserDTO): Promise<User> {
    // Aquí podrías añadir lógica de validación, hash de contraseña, etc.
    const user = {
      name: userData.name,
      email: userData.email,
      password: userData.password, // En un caso real, deberías hashear la contraseña
      is_active: userData.is_active ?? true
    };

    return this.userRepository.create(user);
  }

  /**
   * Actualiza un usuario existente
   */
  async updateUser(id: number, userData: UpdateUserDTO): Promise<User | null> {
    // Verificar si el usuario existe
    const existingUser = await this.userRepository.findById(id);
    if (!existingUser) {
      return null;
    }

    // Aquí podrías añadir lógica de validación, hash de contraseña si se actualiza, etc.
    return this.userRepository.update(id, userData);
  }

  /**
   * Elimina un usuario
   */
  async deleteUser(id: number): Promise<boolean> {
    return this.userRepository.delete(id);
  }

  /**
   * Lista todos los usuarios
   */
  async listUsers(page = 1, pageSize = 10): Promise<{ users: User[], total: number, pages: number }> {
    const offset = (page - 1) * pageSize;
    const users = await this.userRepository.findAll(pageSize, offset);
    const total = await this.userRepository.count();
    
    return {
      users,
      total,
      pages: Math.ceil(total / pageSize)
    };
  }
}
