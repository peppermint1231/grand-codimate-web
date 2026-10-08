export const patientDirectorySchema = `
CREATE TABLE IF NOT EXISTS patient_directory_meta(id INTEGER PRIMARY KEY,phase TEXT NOT NULL,cursor TEXT NOT NULL DEFAULT '',processed INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,policy_hash TEXT NOT NULL DEFAULT '');
INSERT OR IGNORE INTO patient_directory_meta(id,phase) VALUES(1,'consultations');
CREATE TABLE IF NOT EXISTS patient_relations(section TEXT NOT NULL,patient_id TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(section,patient_id,id));
CREATE INDEX IF NOT EXISTS patient_relations_entity ON patient_relations(section,id);
CREATE TABLE IF NOT EXISTS patient_directory_dirty(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS patient_directory(
 id TEXT PRIMARY KEY,value TEXT NOT NULL,identity TEXT NOT NULL,phone_key TEXT NOT NULL,birth_key TEXT NOT NULL,
 archived INTEGER NOT NULL,merged INTEGER NOT NULL,name_sort TEXT NOT NULL,recent TEXT NOT NULL,registered TEXT NOT NULL,
 revenue INTEGER NOT NULL,outstanding INTEGER NOT NULL,grade TEXT NOT NULL,address_status TEXT NOT NULL,region TEXT NOT NULL,imported INTEGER NOT NULL,facets TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_directory_recent ON patient_directory(archived,merged,recent DESC,id DESC);
CREATE INDEX IF NOT EXISTS patient_directory_name ON patient_directory(archived,merged,name_sort,id);
CREATE INDEX IF NOT EXISTS patient_directory_revenue ON patient_directory(archived,merged,revenue DESC,id DESC);
CREATE INDEX IF NOT EXISTS patient_directory_identity_lookup ON patient_directory(identity,archived,merged,id);
CREATE INDEX IF NOT EXISTS patient_directory_phone ON patient_directory(phone_key,id);
CREATE INDEX IF NOT EXISTS patient_directory_birth ON patient_directory(birth_key,id);
CREATE TABLE IF NOT EXISTS patient_directory_identity(identity TEXT PRIMARY KEY,n INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS patient_directory_identity_count ON patient_directory_identity(n,identity);
CREATE TABLE IF NOT EXISTS patient_directory_totals(facet TEXT PRIMARY KEY,n INTEGER NOT NULL,revenue INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patient_directory_tags(facet TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(facet,id));
CREATE INDEX IF NOT EXISTS patient_directory_tags_id ON patient_directory_tags(id);
CREATE VIRTUAL TABLE IF NOT EXISTS patient_directory_search USING fts5(tokens);
CREATE TABLE IF NOT EXISTS patient_directory_queries(key TEXT PRIMARY KEY,generation INTEGER NOT NULL,total INTEGER NOT NULL,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS patient_directory_queries_generation ON patient_directory_queries(generation);
CREATE INDEX IF NOT EXISTS patient_directory_queries_age ON patient_directory_queries(at);
CREATE TABLE IF NOT EXISTS patient_directory_pages(key TEXT NOT NULL,generation INTEGER NOT NULL,page INTEGER NOT NULL,sort_value,id TEXT NOT NULL,PRIMARY KEY(key,generation,page));
CREATE INDEX IF NOT EXISTS patient_directory_pages_generation ON patient_directory_pages(generation);
`;
