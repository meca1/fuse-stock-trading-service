-- migrate:up

-- Add stock_symbol column
ALTER TABLE transactions ADD COLUMN stock_symbol VARCHAR(20);

-- Make stock_symbol NOT NULL with a default value
ALTER TABLE transactions ALTER COLUMN stock_symbol SET DEFAULT 'UNKNOWN';
ALTER TABLE transactions ALTER COLUMN stock_symbol SET NOT NULL;

-- Create index on stock_symbol
CREATE INDEX idx_transactions_stock_symbol ON transactions(stock_symbol);

-- Remove the default value for future records
ALTER TABLE transactions ALTER COLUMN stock_symbol DROP DEFAULT;

-- migrate:down

-- Drop stock_symbol column
ALTER TABLE transactions DROP COLUMN stock_symbol; 