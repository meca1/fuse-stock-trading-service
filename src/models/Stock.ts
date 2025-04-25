import { Table, Column, Model, DataType } from 'sequelize-typescript';
import { IStock } from './interfaces';

@Table({
  tableName: 'stocks',
  timestamps: true,
})
export class Stock extends Model implements IStock {
  @Column({
    type: DataType.STRING,
    primaryKey: true,
  })
  symbol!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
  })
  currentPrice!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  lastUpdated!: Date;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description!: string;

  // Las relaciones se configurarán en el archivo index.ts
}
