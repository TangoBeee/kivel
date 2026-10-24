\getenv app_password APP_DATABASE_PASSWORD
CREATE ROLE socket LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE socket TO socket;
ALTER SCHEMA public OWNER TO socket;
