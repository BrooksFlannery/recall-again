-- Grant recall_app role access to quiz and quiz_item tables.
-- recall_app needs SELECT and INSERT because protectedProcedure runs
-- SET LOCAL ROLE recall_app for the entire transaction.

GRANT SELECT, INSERT ON quiz TO recall_app;
GRANT SELECT, INSERT ON quiz_item TO recall_app;
