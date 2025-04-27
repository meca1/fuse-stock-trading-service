-- migrate:up

-- Primero agregamos la columna symbol a transactions
ALTER TABLE transactions ADD COLUMN symbol VARCHAR(20);

-- Actualizamos la columna symbol con los valores de stocks
UPDATE transactions t 
SET symbol = (SELECT symbol FROM stocks s WHERE s.id = t.stock_id);

-- Eliminamos la foreign key y la columna stock_id
ALTER TABLE transactions DROP CONSTRAINT transactions_stock_id_fkey;
ALTER TABLE transactions DROP COLUMN stock_id;

-- Hacemos symbol NOT NULL ya que reemplaza a stock_id
ALTER TABLE transactions ALTER COLUMN symbol SET NOT NULL;

-- Creamos un índice en symbol para mantener el rendimiento
CREATE INDEX idx_transactions_symbol ON transactions(symbol);

-- Finalmente eliminamos la tabla stocks
DROP TABLE stocks;

-- migrate:down

-- Recreamos la tabla stocks
CREATE TABLE stocks (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  current_price DECIMAL(10, 2) NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agregamos el índice original
CREATE INDEX idx_stocks_symbol ON stocks(symbol);

-- Agregamos stock_id a transactions
ALTER TABLE transactions ADD COLUMN stock_id BIGINT;

-- Insertamos los stocks únicos desde transactions
INSERT INTO stocks (symbol, name, current_price)
SELECT DISTINCT t.symbol, t.symbol as name, 0 as current_price
FROM transactions t;

-- Actualizamos stock_id en transactions
UPDATE transactions t
SET stock_id = (SELECT id FROM stocks s WHERE s.symbol = t.symbol);

-- Eliminamos la columna symbol
ALTER TABLE transactions DROP COLUMN symbol;

-- Hacemos stock_id NOT NULL y agregamos la foreign key
ALTER TABLE transactions ALTER COLUMN stock_id SET NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_stock_id_fkey 
  FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE; 