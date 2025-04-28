-- migrate:up
ALTER TABLE transactions DROP COLUMN symbol;
 
-- migrate:down
ALTER TABLE transactions ADD COLUMN symbol VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN'; 