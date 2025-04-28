-- migrate:up
ALTER TABLE portfolios ADD COLUMN total_value NUMERIC DEFAULT 0;
ALTER TABLE portfolios ADD COLUMN last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
 
-- migrate:down
ALTER TABLE portfolios DROP COLUMN total_value;
ALTER TABLE portfolios DROP COLUMN last_updated; 