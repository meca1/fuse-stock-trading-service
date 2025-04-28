-- migrate:up
-- Primero fijamos valores a NULL en stock_symbol si existen
UPDATE transactions 
SET stock_symbol = 'UNKNOWN' 
WHERE stock_symbol IS NULL;

-- Ahora hacemos que stock_symbol sea NOT NULL para prevenir futuros problemas
ALTER TABLE transactions 
ALTER COLUMN stock_symbol SET NOT NULL;

-- Añadimos la columna notes
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS notes TEXT;

-- migrate:down
-- Revertir la columna notes
ALTER TABLE transactions
DROP COLUMN IF EXISTS notes;

-- Permitir NULL en stock_symbol
ALTER TABLE transactions 
ALTER COLUMN stock_symbol DROP NOT NULL; 