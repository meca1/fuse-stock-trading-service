-- migrate:up
ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT 'COMPLETED' NOT NULL;

-- migrate:down
ALTER TABLE transactions DROP COLUMN status; 