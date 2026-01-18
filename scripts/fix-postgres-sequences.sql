-- Fix PostgreSQL sequences after migration
-- This script automatically finds and resets all sequences to the maximum ID value + 1
-- Run this after migrating data from SQLite to PostgreSQL

DO $$
DECLARE
    seq_rec RECORD;
    table_name TEXT;
    column_name TEXT;
    max_id_val INTEGER;
BEGIN
    -- Find all sequences and their associated tables/columns
    FOR seq_rec IN
        SELECT 
            schemaname,
            sequencename,
            quote_ident(schemaname) || '.' || quote_ident(sequencename) AS full_seq_name
        FROM pg_sequences
        WHERE schemaname = 'public'
    LOOP
        -- Find the table and column that uses this sequence
        SELECT 
            quote_ident(n.nspname) || '.' || quote_ident(t.relname),
            a.attname
        INTO table_name, column_name
        FROM pg_depend d
        JOIN pg_class t ON d.refobjid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_attribute a ON (d.refobjid, d.refobjsubid) = (a.attrelid, a.attnum)
        WHERE d.classid = 'pg_class'::regclass
            AND d.objid = seq_rec.full_seq_name::regclass
            AND d.deptype = 'a'
        LIMIT 1;
        
        -- If we found a table and column, reset the sequence
        IF table_name IS NOT NULL AND column_name IS NOT NULL THEN
            -- Get the maximum ID from the table
            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %s', column_name, table_name) INTO max_id_val;
            
            -- Reset the sequence to max_id + 1
            IF max_id_val > 0 THEN
                EXECUTE format('SELECT setval(%L, %s, true)', seq_rec.full_seq_name, max_id_val);
                RAISE NOTICE 'Reset sequence % to %', seq_rec.full_seq_name, max_id_val + 1;
            END IF;
        END IF;
    END LOOP;
END $$;

-- Verify activity sequence is fixed (most critical one)
SELECT 'activity_id_seq' as sequence_name, 
       last_value as current_value, 
       (SELECT COALESCE(MAX(id), 0) FROM activity) as max_id_in_table
FROM activity_id_seq;
