-- migrate:up
ALTER TABLE stocks DROP COLUMN IF EXISTS page_token;
ALTER TABLE stocks DROP COLUMN IF EXISTS page_number;
ALTER TABLE stocks DROP COLUMN IF EXISTS exchange;

-- migrate:down
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS page_token TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS page_number INTEGER;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS exchange VARCHAR(50);

COMMENT ON COLUMN stocks.page_token IS 'Token de paginación para acceder rápidamente a esta acción (formato base64)';
COMMENT ON COLUMN stocks.page_number IS 'Número de página donde se encuentra la acción';
COMMENT ON COLUMN stocks.exchange IS 'Bolsa donde se negocia la acción'; 