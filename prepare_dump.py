import subprocess
import re

db_path = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/a7a5ace5f96faa2410d2159f829a056ad8508e285e6582ee0491f1450d6b01d0.sqlite"

# Dump database
result = subprocess.run(["sqlite3", db_path, ".dump"], capture_output=True, text=True, check=True)
dump_content = result.stdout

# Modify dump content
new_dump = []
for line in dump_content.splitlines():
    match = re.match(r'^CREATE TABLE ("?\w+"?)(?:\s|\()', line)
    if match:
        table_name = match.group(1)
        # SQLite's .dump uses `CREATE TABLE IF NOT EXISTS` sometimes, but standard is `CREATE TABLE`
        # We explicitly drop the table to make sure it's overwritten cleanly
        new_dump.append(f'DROP TABLE IF EXISTS {table_name};')
    new_dump.append(line)

with open("sync_dump.sql", "w") as f:
    f.write("\n".join(new_dump))

print("Created sync_dump.sql with DROP TABLE statements.")
