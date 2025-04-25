import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from './User';
import { IPortfolio } from './interfaces';

@Table({
  tableName: 'portfolios',
  timestamps: true,
})
export class Portfolio extends Model implements IPortfolio {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description!: string;

  @Column({
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
  })
  balance!: number;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId!: string;

  @BelongsTo(() => User)
  user!: User;

  // Las relaciones se configurarán en el archivo index.ts
}
