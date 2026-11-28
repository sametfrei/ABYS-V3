# ABYS Universal Connectors

ABYS uses one canonical data model and one shared sync pipeline. Source-specific adapters read data, map it into canonical entities, validate records, quarantine rejected rows, and promote approved records into KPI observations and process events. A source adapter must never write back to an ERP unless a separate, explicitly approved command adapter is implemented.

## Supported connection methods

| Method / driver | Status | Notes |
|---|---|---|
| Generic REST / JSON / OData | Ready | Read-only GET, supported auth modes, pagination, host validation, schema discovery |
| PostgreSQL | Ready | Read-only transaction; use a database principal with SELECT-only permissions |
| Microsoft SQL Server | Ready | Read-only SELECT query; SQL Server connection must use a principal with SELECT-only permissions |
| MySQL / MariaDB | Ready | Read-only transaction; use a database principal with SELECT-only permissions |
| ERP12 native adapter | Planned | Vendor API, database engine, schema, and permission model have not yet been verified |
| Other vendor APIs | Conditional | Registry entries may reuse the generic REST adapter; native protocols still need a dedicated adapter and verification |

A vendor appearing in the registry does not mean that its native API has been implemented or tested. A vendor connector is usable only when its actual endpoint and protocol match the adapter registered for it.

## SQL connector configuration

Create a connection in **Dashboard → Connectors** and select PostgreSQL, SQL Server, or MySQL / MariaDB. Enter an environment-variable name, not a connection string. The secret itself must be configured on the ABYS server process and must not be committed to source control.

Examples of environment-variable names:

- PostgreSQL: `ERP_READONLY_DATABASE_URL`
- SQL Server: `ERP_SQLSERVER_CONNECTION`
- MySQL / MariaDB: `ERP_MYSQL_CONNECTION`

Example query shapes (replace table and column names with the source system's real schema):

**PostgreSQL**
```sql
SELECT id, name, updated_at
FROM source_table
WHERE updated_at > $1
```

**Microsoft SQL Server**
```sql
SELECT id, name, updated_at
FROM dbo.source_table
WHERE updated_at > @p1
```

**MySQL / MariaDB**
```sql
SELECT id, name, updated_at
FROM source_table
WHERE updated_at > ?
```

Enable incremental sync when the query uses the matching checkpoint parameter. Map the source identifier to `idField`, the source modification timestamp to `updatedAtField`, and each canonical ABYS field to its source column in `fieldMap`.

## Safety and limits

- Only one `SELECT` statement is accepted. Write, administration, file-export, and multi-statement SQL is rejected.
- Query timeouts are limited to 10 seconds.
- Connection secrets are referenced by environment-variable name and are not persisted in connector configuration.
- A connection test samples at most 50 rows and records only observed field names and types.
- A sync reads at most 5,000 rows per run. If the cap is reached, the checkpoint is not advanced, preventing a partial read from skipping source rows. Narrow the query to a smaller date range and run again.
- Use a separate database principal with **SELECT-only** permissions for every driver. PostgreSQL and MySQL also use read-only transactions; SQL Server does not offer the same transaction-level READ ONLY mode, so least-privilege database permissions are mandatory.
- Map only business fields required by ABYS; avoid transferring unnecessary personal or sensitive data.

## ERP12 pilot

ERP12 is registered as planned, not ready. Before enabling a native ERP12 adapter, obtain one of the following from the ERP12 provider or the shop's authorized IT contact:

1. Official API / web-service documentation and a read-only integration account; or
2. Database engine and version, read-only credentials, and approved table/view definitions; or
3. A documented export format and anonymized sample exports for products, stock, sales, invoices, current accounts, and payments.

Do not guess the ERP12 database engine or query internal tables without an approved schema. Once the method is verified, add the ERP12-specific extraction adapter while keeping the canonical data model and intelligence pipeline unchanged.
