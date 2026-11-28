import { beforeEach, describe, expect, it, vi } from "vitest";

const pgMocks = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  },
  Client: vi.fn(),
  mssqlPool: {
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn(),
  },
  mssqlRequest: {
    input: vi.fn(),
    query: vi.fn(),
    timeout: 0,
  },
  MssqlConnectionPool: vi.fn(),
  mssqlParseConnectionString: vi.fn(() => ({ server: "erp-db", options: {}, pool: {} })),
  mysqlConnection: {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    end: vi.fn(),
  },
  mysqlCreateConnection: vi.fn(),
}));

vi.mock("pg", () => ({ Client: pgMocks.Client }));
vi.mock("mssql", () => ({
  ConnectionPool: Object.assign(pgMocks.MssqlConnectionPool, {
    parseConnectionString: pgMocks.mssqlParseConnectionString,
  }),
  DateTime2: "DateTime2",
}));
vi.mock("mysql2/promise", () => ({
  createConnection: pgMocks.mysqlCreateConnection,
}));

const { mysqlAdapter, sqlAdapter, sqlServerAdapter, validateSqlConfig } = await import("../src/lib/connectors/sql-adapter");

const CONFIG = {
  kind: "sql" as const,
  driver: "postgres" as const,
  connectionStringEnvVar: "ERP_READONLY_DATABASE_URL",
  query: "SELECT id, company_name, balance, changed_at FROM accounts WHERE ($1::timestamptz IS NULL OR changed_at > $1::timestamptz)",
  checkpointParam: true,
  entity: "account" as const,
  idField: "id",
  updatedAtField: "changed_at",
  fieldMap: { name: "company_name", balance: "balance" },
};

function context(checkpoint: string | null = null) {
  return {
    orgId: "org-test",
    configId: "connector-test",
    checkpoint,
    fetchImpl: fetch,
    resolveHost: async () => ["93.184.216.34"],
    resolveSecret: (name: string) => {
      if (name === "ERP_READONLY_DATABASE_URL") return "postgresql://readonly:secret@127.0.0.1:5432/erp";
      if (name === "ERP_MSSQL_CONNECTION") return "Server=erp-db;Database=ERP;User Id=abys_ro;Password=hidden;Encrypt=true;TrustServerCertificate=false";
      if (name === "ERP_MYSQL_CONNECTION") return "mysql://abys_ro:hidden@127.0.0.1:3306/erp";
      return undefined;
    },
    now: () => new Date("2026-11-27T09:00:00.000Z"),
    sleep: async () => {},
  };
}

describe("PostgreSQL salt-okunur konnektörü", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgMocks.client.connect.mockResolvedValue(undefined);
    pgMocks.client.end.mockResolvedValue(undefined);
    pgMocks.client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM (")) {
        return {
          rows: [{
            id: 42,
            company_name: "Örnek Cari",
            balance: 1250.5,
            changed_at: new Date("2026-11-26T10:00:00.000Z"),
          }],
          rowCount: 1,
          fields: [],
        };
      }
      return { rows: [], rowCount: 0, fields: [] };
    });
    pgMocks.Client.mockImplementation(function MockClient() { return pgMocks.client; });
    pgMocks.mssqlPool.connect.mockResolvedValue(undefined);
    pgMocks.mssqlPool.request.mockReturnValue(pgMocks.mssqlRequest);
    pgMocks.mssqlPool.close.mockResolvedValue(undefined);
    pgMocks.mssqlRequest.input.mockReturnValue(pgMocks.mssqlRequest);
    pgMocks.mssqlRequest.query.mockResolvedValue({
      recordset: [{
        id: 84,
        company_name: "MSSQL Örnek Cari",
        balance: 750,
        changed_at: new Date("2026-11-25T10:00:00.000Z"),
      }],
    });
    pgMocks.MssqlConnectionPool.mockImplementation(function MockPool() { return pgMocks.mssqlPool; });
    pgMocks.mssqlParseConnectionString.mockReturnValue({ server: "erp-db", options: {}, pool: {} });
    pgMocks.mysqlConnection.query.mockImplementation(async (query: string | { sql: string }) => {
      const sqlText = typeof query === "string" ? query : query.sql;
      if (sqlText.startsWith("SELECT * FROM (")) {
        return [[{
          id: 21,
          company_name: "MySQL Örnek Cari",
          balance: 900,
          changed_at: new Date("2026-11-24T10:00:00.000Z"),
        }], []];
      }
      return [[], []];
    });
    pgMocks.mysqlConnection.beginTransaction.mockResolvedValue(undefined);
    pgMocks.mysqlConnection.commit.mockResolvedValue(undefined);
    pgMocks.mysqlConnection.rollback.mockResolvedValue(undefined);
    pgMocks.mysqlConnection.end.mockResolvedValue(undefined);
    pgMocks.mysqlCreateConnection.mockResolvedValue(pgMocks.mysqlConnection);
  });

  it("salt-okunur transaction içinde satırları kanonik kayda dönüştürür", async () => {
    const out = await sqlAdapter.sync(CONFIG, context("2026-11-20T00:00:00.000Z"));

    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toMatchObject({
      entity: "account",
      externalId: "42",
      fields: { name: "Örnek Cari", balance: 1250.5 },
    });
    expect(out.checkpoint).toBe("2026-11-26T10:00:00.000Z");
    expect(out.readCount).toBe(1);
    expect(pgMocks.client.query).toHaveBeenCalledWith("BEGIN READ ONLY");
    expect(pgMocks.client.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT * FROM ("),
      ["2026-11-20T00:00:00.000Z"]
    );
    expect(pgMocks.client.query).toHaveBeenCalledWith("COMMIT");
    expect(pgMocks.client.end).toHaveBeenCalled();
  });

  it("yazma komutlarını, çoklu ifadeyi ve güvensiz env adını reddeder", () => {
    expect(validateSqlConfig(CONFIG)).toEqual([]);
    expect(validateSqlConfig({ ...CONFIG, query: "UPDATE accounts SET balance = 0" })).toContain(
      "Yalnızca SELECT sorguları kabul edilir."
    );
    expect(validateSqlConfig({ ...CONFIG, query: "SELECT * FROM accounts; DROP TABLE accounts" })).toContain(
      "Tek bir SQL ifadesi kullanılmalı; noktalı virgül kabul edilmez."
    );
    expect(validateSqlConfig({ ...CONFIG, connectionStringEnvVar: "PASSWORD=secret" })).toContain(
      "connectionStringEnvVar geçerli bir ortam değişkeni adı olmalı."
    );
  });

  it("bağlantı testinde şema döndürür, eksik alanı bildirir ve sorguyu yazmadan dener", async () => {
    const result = await sqlAdapter.probe!(CONFIG, context());
    expect(result.ok).toBe(true);
    expect(result.recordsSeen).toBe(1);
    expect(result.observedFields.map((field) => field.path)).toContain("company_name");
    expect(result.missingMappedFields).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/salt-okunur/);
  });

  it("satır sınırında checkpoint'i ilerletmez; olası kırpılma uyarısı verir", async () => {
    const oldCheckpoint = "2026-11-20T00:00:00.000Z";
    const out = await sqlAdapter.sync({ ...CONFIG, maxRows: 1 }, context(oldCheckpoint));
    expect(out.readCount).toBe(1);
    expect(out.checkpoint).toBe(oldCheckpoint);
    expect(out.warnings.join(" ")).toMatch(/checkpoint ilerletilmedi/i);
  });

  it("SQL Server sürücüsü @p1 parametresini bağlar ve TOP satır sınırı uygular", async () => {
    const config = {
      ...CONFIG,
      driver: "mssql" as const,
      connectionStringEnvVar: "ERP_MSSQL_CONNECTION",
      query: "SELECT id, company_name, balance, changed_at FROM dbo.accounts WHERE changed_at > @p1",
    };
    const out = await sqlServerAdapter.sync(config, context("2026-11-20T00:00:00.000Z"));
    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toMatchObject({
      externalId: "84",
      fields: { name: "MSSQL Örnek Cari", balance: 750 },
    });
    expect(pgMocks.mssqlRequest.input).toHaveBeenCalledWith(
      "p1",
      "DateTime2",
      new Date("2026-11-20T00:00:00.000Z")
    );
    expect(pgMocks.mssqlRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT TOP (5000)")
    );
    expect(pgMocks.mssqlPool.close).toHaveBeenCalled();
  });

  it("MySQL sürücüsü ? parametresini bağlar ve salt-okunur transaction kullanır", async () => {
    const config = {
      ...CONFIG,
      driver: "mysql" as const,
      connectionStringEnvVar: "ERP_MYSQL_CONNECTION",
      query: "SELECT id, company_name, balance, changed_at FROM accounts WHERE changed_at > ?",
    };
    const out = await mysqlAdapter.sync(config, context("2026-11-20T00:00:00.000Z"));
    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toMatchObject({
      externalId: "21",
      fields: { name: "MySQL Örnek Cari", balance: 900 },
    });
    expect(pgMocks.mysqlConnection.query).toHaveBeenCalledWith(
      "SET TRANSACTION READ ONLY"
    );
    expect(pgMocks.mysqlConnection.beginTransaction).toHaveBeenCalled();
    expect(pgMocks.mysqlConnection.query).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("LIMIT 5000") }),
      ["2026-11-20T00:00:00.000Z"]
    );
    expect(pgMocks.mysqlConnection.commit).toHaveBeenCalled();
    expect(pgMocks.mysqlConnection.end).toHaveBeenCalled();
  });

  it("her SQL sürücüsü yalnızca kendi checkpoint parametre sözdizimini kabul eder", () => {
    expect(validateSqlConfig({
      ...CONFIG,
      driver: "mssql",
      query: "SELECT id FROM accounts WHERE changed_at > $1",
    })).toContain("checkpointParam açıkken sorgu önceki senkron zamanını @p1 parametresiyle kullanmalı.");
    expect(validateSqlConfig({
      ...CONFIG,
      driver: "mysql",
      query: "SELECT id FROM accounts WHERE changed_at > ?",
      checkpointParam: false,
    })).toContain("Parametreli sorgular için checkpointParam açılmalı.");
  });
});
