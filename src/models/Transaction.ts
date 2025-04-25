import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Portfolio } from './Portfolio';
import { Stock } from './Stock';
import { ITransaction, TransactionType, TransactionStatus } from './interfaces';

@Table({
  tableName: 'transactions',
  timestamps: true,
})
export class Transaction extends Model implements ITransaction {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => Portfolio)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  portfolioId!: string;

  @BelongsTo(() => Portfolio)
  portfolio!: Portfolio;

  @ForeignKey(() => Stock)
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  stockSymbol!: string;

  @BelongsTo(() => Stock)
  stock!: Stock;

  @Column({
    type: DataType.ENUM(...Object.values(TransactionType)),
    allowNull: false,
  })
  type!: TransactionType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity!: number;

  @Column({
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
  })
  price!: number;

  @Column({
    type: DataType.DECIMAL(20, 2),
    allowNull: false,
  })
  totalAmount!: number;

  @Column({
    type: DataType.ENUM(...Object.values(TransactionStatus)),
    allowNull: false,
    defaultValue: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  errorMessage!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  transactionDate!: Date;
}
