-- Grant recall_app role access to flashcard table.
-- No RLS on flashcard; ownership is enforced via fact (which has RLS).
-- recall_app needs SELECT and INSERT because protectedProcedure runs
-- SET LOCAL ROLE recall_app for the entire transaction.

GRANT SELECT, INSERT ON flashcard TO recall_app;
