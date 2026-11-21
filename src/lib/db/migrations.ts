/**
 * Sıralı şema migration'ları. Kural: yayınlanmış migration DEĞİŞTİRİLMEZ,
 * yeni değişiklik yeni migration olarak eklenir. Tüm iş varlıkları org_id
 * taşır (kurum izolasyonu). Tam varlık listesi: docs/DATA_MODEL.md.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
  /** Doluysa migration ancak bu ortam değişkeni tam olarak "true" iken uygulanır. */
  approvalEnv?: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "cekirdek: organizasyon, kullanici, oturum, denetim",
    sql: `
      CREATE TABLE organizations (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        sector_id  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        role          TEXT NOT NULL, -- board|ceo|clevel|dept_manager|risk_manager|analyst|auditor|data_admin|sys_admin
        password_hash TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active', -- active|disabled
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX users_org ON users(org_id);

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id),
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      CREATE TABLE audit_events (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        actor      TEXT NOT NULL,
        type       TEXT NOT NULL,
        summary    TEXT NOT NULL,
        detail     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_org_time ON audit_events(org_id, created_at DESC);
    `,
  },
  {
    id: 2,
    name: "karar varliklari: vakalar ve karar kayitlari",
    sql: `
      -- Vaka icerigi JSONB'de tutulur (kanit zinciri, secenekler, karsi senaryo
      -- yapisi hala evrimlesiyor); sorgulanan alanlar kolon olarak acildi.
      CREATE TABLE decision_cases (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        sector_id   TEXT NOT NULL,
        category_id TEXT NOT NULL,
        severity    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open', -- open|decided
        title       TEXT NOT NULL,
        confidence  INTEGER NOT NULL,
        payload     JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX cases_org_sector ON decision_cases(org_id, sector_id, status);

      CREATE TABLE decision_records (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        case_id      TEXT NOT NULL REFERENCES decision_cases(id),
        sector_id    TEXT NOT NULL,
        choice       TEXT NOT NULL, -- accepted|rejected|modified
        decided_by   TEXT NOT NULL,
        payload      JSONB NOT NULL,
        outcome      JSONB,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX records_org_sector ON decision_records(org_id, sector_id, created_at DESC);
    `,
  },
  {
    id: 3,
    name: "veri katmani: veri setleri, kpi degerleri, sinyaller",
    sql: `
      CREATE TABLE datasets (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        sector_id    TEXT NOT NULL,
        source_label TEXT NOT NULL,      -- dosya adi / kaynak etiketi
        raw_content  TEXT NOT NULL,      -- ham girdi korunur (veri soyu)
        ingested_by  TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX datasets_org ON datasets(org_id, sector_id, created_at DESC);

      CREATE TABLE kpi_values (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        dataset_id TEXT NOT NULL REFERENCES datasets(id),
        label      TEXT NOT NULL,
        value      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX kpi_org_label ON kpi_values(org_id, label, created_at DESC);

      CREATE TABLE signals (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        sector_id   TEXT NOT NULL,
        dataset_id  TEXT REFERENCES datasets(id), -- hangi veriden dogdu (soy)
        category_id TEXT NOT NULL,
        severity    TEXT NOT NULL,
        title       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        payload     JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX signals_org ON signals(org_id, sector_id, status);
    `,
  },
  {
    id: 4,
    name: "yurutme katmani: aksiyonlar, sonuclar, dersler",
    sql: `
      -- Karar -> hesap verebilir aksiyon. Her aksiyon kararina baglidir
      -- (ABYS genel gorev yoneticisi degildir; koken zinciri korunur).
      CREATE TABLE actions (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        decision_id  TEXT NOT NULL REFERENCES decision_records(id),
        case_id      TEXT NOT NULL REFERENCES decision_cases(id),
        title        TEXT NOT NULL,
        owner        TEXT NOT NULL,
        due_at       TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'open', -- open|in_progress|done|cancelled
        progress_note TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX actions_org ON actions(org_id, status);

      -- Gerceklesen sonuc: beklenen ile kiyas, kurumsal ders
      CREATE TABLE outcomes (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        decision_id TEXT NOT NULL REFERENCES decision_records(id),
        result      TEXT NOT NULL, -- improved|unchanged|worsened
        note        TEXT NOT NULL,
        lesson      TEXT,          -- kurumsal hafizaya gececek ders
        recorded_by TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX outcomes_org ON outcomes(org_id, created_at DESC);
    `,
  },
  {
    id: 5,
    name: "model calisma kaydi: her AI kosusunun izi",
    sql: `
      -- Her AI koşusu izlenir (master plan md.19): hangi sağlayıcı/model üretti,
      -- ne kadar sürdü, çıktı doğrulamadan geçti mi. İzlenebilirlik + benchmark.
      CREATE TABLE model_runs (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        task_type     TEXT NOT NULL,   -- decision_cases | risk_assessment | briefing | extract
        provider      TEXT NOT NULL,   -- ollama | gemini | deterministic
        model         TEXT,
        policy        TEXT,            -- LOCAL_ONLY | CLOUD_ALLOWED | CLOUD_ONLY
        latency_ms    INTEGER,
        output_valid  BOOLEAN,
        result_count  INTEGER,
        actor         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX model_runs_org ON model_runs(org_id, task_type, created_at DESC);
    `,
  },
  {
    id: 6,
    name: "kurumsal hafiza: belgeler ve parcalar (RAG temeli)",
    sql: `
      CREATE TABLE documents (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        title        TEXT NOT NULL,
        source_type  TEXT NOT NULL,          -- txt | md | csv | policy | report
        mime         TEXT,
        byte_size    INTEGER,
        uploaded_by  TEXT NOT NULL,
        -- Yetki-farkindalikli erisim: hangi roller okuyabilir (bos = tum roller)
        allowed_roles TEXT[],
        version      INTEGER NOT NULL DEFAULT 1,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX documents_org ON documents(org_id, created_at DESC);

      -- Parcalar: atif verilebilir en kucuk birim (belge + sira + metin).
      -- embedding kolonu simdilik NULL; semantik erisim eklendiginde doldurulur
      -- (arayuz ayni kalir, yalnizca siralama degisir).
      CREATE TABLE document_chunks (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text        TEXT NOT NULL,
        embedding   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX chunks_doc ON document_chunks(document_id, chunk_index);
      CREATE INDEX chunks_org ON document_chunks(org_id);
    `,
  },
  {
    id: 7,
    name: "senaryo laboratuvari: kaydedilen senaryolar",
    sql: `
      CREATE TABLE scenarios (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        sector_id    TEXT NOT NULL,
        template_id  TEXT NOT NULL,
        name         TEXT NOT NULL,
        inputs       JSONB NOT NULL,   -- kullanici degiskenleri
        results      JSONB NOT NULL,   -- deterministik hesap ciktisi (taban/iyimser/kotumser)
        formula_text TEXT NOT NULL,    -- kullanilan formul (izlenebilirlik)
        created_by   TEXT NOT NULL,
        case_id      TEXT REFERENCES decision_cases(id), -- Karar Merkezi'ne baglanti
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX scenarios_org ON scenarios(org_id, created_at DESC);
    `,
  },
  {
    id: 8,
    name: "entegrasyon: webhook sirlari ve teslimat kayitlari",
    sql: `
      -- Kurum basina webhook sirri (HMAC imza dogrulamasi icin)
      CREATE TABLE webhook_secrets (
        org_id     TEXT PRIMARY KEY REFERENCES organizations(id),
        secret     TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        rotated_at TIMESTAMPTZ
      );

      -- Teslimat kaydi: idempotency (ayni anahtar iki kez islenmez) +
      -- replay korumasi + hiz siniri sayimi icin zaman damgali kayit.
      CREATE TABLE webhook_deliveries (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        idempotency_key TEXT NOT NULL,
        signature       TEXT NOT NULL,
        payload_size    INTEGER NOT NULL,
        accepted        BOOLEAN NOT NULL,
        reason          TEXT,
        dataset_id      TEXT REFERENCES datasets(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX webhook_idem ON webhook_deliveries(org_id, idempotency_key);
      CREATE INDEX webhook_org_time ON webhook_deliveries(org_id, created_at DESC);
    `,
  },
  {
    id: 9,
    name: "integration gateway: api anahtarlari ve olay akisi",
    sql: `
      -- Makine-makine erisim icin API anahtari (portal -> ABYS).
      -- Anahtarin kendisi HASH'lenerek saklanir; duz metin yalnizca uretimde
      -- bir kez gosterilir (parola gibi).
      CREATE TABLE api_keys (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        name        TEXT NOT NULL,
        key_hash    TEXT NOT NULL,
        key_prefix  TEXT NOT NULL,          -- gosterim icin ilk 8 karakter
        scopes      TEXT[] NOT NULL,        -- events:write | read:advisors | read:all
        last_used_at TIMESTAMPTZ,
        revoked_at  TIMESTAMPTZ,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX api_keys_org ON api_keys(org_id) WHERE revoked_at IS NULL;
      CREATE UNIQUE INDEX api_keys_hash ON api_keys(key_hash);

      -- Portal olaylari. Ham olay KORUNUR (veri soyu); metrikler bundan
      -- deterministik olarak turetilir.
      CREATE TABLE integration_events (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        event_type    TEXT NOT NULL,        -- lead.updated, call.completed, session.started...
        actor_ref     TEXT,                 -- danisman kimligi (portal id'si)
        subject_ref   TEXT,                 -- lead/customer/sale id'si
        occurred_at   TIMESTAMPTZ NOT NULL, -- portalin bildirdigi zaman
        received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        payload       JSONB NOT NULL,
        source        TEXT NOT NULL,        -- portal adi
        batch_id      TEXT,                 -- toplu gonderim izi
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX events_org_time ON integration_events(org_id, occurred_at DESC);
      CREATE INDEX events_org_actor ON integration_events(org_id, actor_ref, occurred_at DESC);
      CREATE INDEX events_org_type ON integration_events(org_id, event_type, occurred_at DESC);
      -- Idempotency: ayni olay iki kez islenmez
      CREATE UNIQUE INDEX events_dedup ON integration_events(org_id, source, id);
    `,
  },
  {
    id: 10,
    name: "kok neden zinciri: neden-sonuc baglantilari",
    sql: `
      -- Korelasyon asla kanitlanmis nedensellik olarak sunulmaz; varsayilan
      -- durum 'observed_correlation'dir ve yalnizca insan onayiyla ilerler.
      CREATE TABLE causal_links (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        case_id         TEXT NOT NULL REFERENCES decision_cases(id),
        from_label      TEXT NOT NULL,
        to_label        TEXT NOT NULL,
        relation_status TEXT NOT NULL DEFAULT 'observed_correlation', -- observed_correlation|inferred|expert_confirmed|data_confirmed|disputed
        confidence      INTEGER NOT NULL,
        note            TEXT,
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX causal_links_org_case ON causal_links(org_id, case_id);
    `,
  },
  {
    id: 11,
    name: "kpi kayit defteri: kpi tanimlari ve esikleri",
    sql: `
      -- KPI sozluk kaydi: her metrigin sahibi, formulu ve alarm esikleri.
      -- Esik karsilastirmasi dilbilim modeline birakilmaz, kodda yapilir
      -- (bkz. evaluateAgainstThresholds).
      CREATE TABLE kpi_definitions (
        id                 TEXT PRIMARY KEY,
        org_id             TEXT NOT NULL REFERENCES organizations(id),
        name               TEXT NOT NULL,
        description        TEXT,
        unit               TEXT,
        formula_text       TEXT,
        owner              TEXT,
        department         TEXT,
        target             NUMERIC,
        warn_threshold     NUMERIC,
        critical_threshold NUMERIC,
        update_frequency   TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX kpi_definitions_org ON kpi_definitions(org_id);
      CREATE UNIQUE INDEX kpi_definitions_org_name ON kpi_definitions(org_id, name);
    `,
  },
  {
    id: 12,
    name: "karar durumlari: yasam dongusu alanlari",
    sql: `
      -- Karar tek adimda 'approved' olmakla kalmaz; onay/yurutme/sonuc
      -- inceleme dongusunden gecer. Varsayilan 'approved' ile mevcut
      -- davranis (POST /api/decisions) bozulmaz.
      ALTER TABLE decision_records ADD COLUMN state TEXT NOT NULL DEFAULT 'approved';
      ALTER TABLE decision_records ADD COLUMN review_date TIMESTAMPTZ;
      ALTER TABLE decision_records ADD COLUMN expected_outcome TEXT;
      ALTER TABLE decision_records ADD COLUMN risks_of_acting TEXT;
      ALTER TABLE decision_records ADD COLUMN risks_of_not_acting TEXT;
    `,
  },
  {
    id: 13,
    name: "denetim gunlugu: kurcalamaya-karsi hash zinciri",
    sql: `
      -- Zincir alanlari eski satirlarda NULL kalir (zincir-oncesi kayit
      -- sayilir, bkz. verifyAuditChain). Yeni yazimlar prev_hash'i ayni
      -- organizasyonun son kaydindan alir, entry_hash sha256 ile hesaplanir.
      ALTER TABLE audit_events ADD COLUMN prev_hash TEXT;
      ALTER TABLE audit_events ADD COLUMN entry_hash TEXT;
    `,
  },
  {
    id: 14,
    name: "entegrasyon olaylari: kimlik modeli duzeltmesi",
    sql: `
      -- Eski semada portalin gonderdigi id dogrudan PK'ydi; iki FARKLI kurumun
      -- portali ayni harici id'yi (orn. "evt_1001") gonderirse ikincisi
      -- reddediliyordu. Artik dahili id sunucuda uretilir, portal kimligi
      -- external_event_id'de tutulur ve tekillik (org_id, source,
      -- external_event_id) uzerinden saglanir. NULL degerler standart SQL
      -- benzersizlik semantiginde birbirine esit sayilmadigindan, portal id
      -- gondermeyen olaylar dogal olarak tekillik kontrolunden muaf kalir.
      ALTER TABLE integration_events ADD COLUMN external_event_id TEXT;
      UPDATE integration_events SET external_event_id = id;
      DROP INDEX events_dedup;
      CREATE UNIQUE INDEX events_dedup ON integration_events(org_id, source, external_event_id);
    `,
  },
  {
    id: 15,
    name: "entegrasyon olaylari: sozlesme sertlestirme (session_ref, schema_version)",
    sql: `
      -- Portal, olaylari bir oturuma (session.started/ended disinda da) baglamak
      -- icin isteğe bagli session_ref gonderebilir; schema_version ileride
      -- sozlesme degisirse geriye donuk uyumlulugu ayirt etmek icindir.
      ALTER TABLE integration_events ADD COLUMN session_ref TEXT;
      ALTER TABLE integration_events ADD COLUMN schema_version TEXT;
    `,
  },
  {
    id: 16,
    name: "tais tesis yonetimi demo: kurum kodu + Bitrix24-esleme varliklari",
    sql: `
      -- Idempotent seed kontrolu icin kurum kodu (yalnizca kod atanan kurumlarda
      -- tekillik zorunlu; mevcut demo kurumu kod'suz kalmaya devam eder).
      ALTER TABLE organizations ADD COLUMN code TEXT;
      CREATE UNIQUE INDEX organizations_code ON organizations(code) WHERE code IS NOT NULL;

      -- Asagidaki tais_* tablolari TAIS IKF MMC demosunun Bitrix24 nesnelerine
      -- eslenecek is varliklarini tutar (Company/Deal/Task/Activity/User/
      -- Department/Smart Process). Tumu org-farkindalikli.
      CREATE TABLE tais_customers (
        id                 TEXT PRIMARY KEY,
        org_id             TEXT NOT NULL REFERENCES organizations(id),
        name               TEXT NOT NULL,
        district           TEXT NOT NULL,
        bitrix_company_id  TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_customers_org ON tais_customers(org_id);

      CREATE TABLE tais_locations (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        name        TEXT NOT NULL,
        district    TEXT NOT NULL,
        category    TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_locations_org ON tais_locations(org_id);
      CREATE INDEX tais_locations_customer ON tais_locations(customer_id);

      CREATE TABLE tais_contracts (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        customer_id  TEXT NOT NULL REFERENCES tais_customers(id),
        category     TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'active',
        value_azn    NUMERIC NOT NULL,
        start_date   TIMESTAMPTZ NOT NULL,
        renewal_date TIMESTAMPTZ NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_contracts_org ON tais_contracts(org_id);
      CREATE INDEX tais_contracts_customer ON tais_contracts(customer_id);
      CREATE INDEX tais_contracts_renewal ON tais_contracts(org_id, renewal_date);

      CREATE TABLE tais_teams (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        name       TEXT NOT NULL,
        category   TEXT NOT NULL,
        capacity   INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_teams_org ON tais_teams(org_id);

      CREATE TABLE tais_employees (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        team_id    TEXT NOT NULL REFERENCES tais_teams(id),
        name       TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_employees_org ON tais_employees(org_id);
      CREATE INDEX tais_employees_team ON tais_employees(team_id);

      -- employee_id NULL = sahipsiz gorev (senaryonun bir parcasi, bkz. seed.ts)
      CREATE TABLE tais_tasks (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        category     TEXT NOT NULL,
        team_id      TEXT NOT NULL REFERENCES tais_teams(id),
        location_id  TEXT NOT NULL REFERENCES tais_locations(id),
        customer_id  TEXT NOT NULL REFERENCES tais_customers(id),
        employee_id  TEXT REFERENCES tais_employees(id),
        title        TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'open',
        due_at       TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_tasks_org ON tais_tasks(org_id);
      CREATE INDEX tais_tasks_team ON tais_tasks(team_id, status);
      CREATE INDEX tais_tasks_due ON tais_tasks(org_id, status, due_at);

      CREATE TABLE tais_leads (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT REFERENCES tais_customers(id),
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        stage       TEXT NOT NULL DEFAULT 'new',
        source      TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_leads_org ON tais_leads(org_id);

      CREATE TABLE tais_deals (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        category    TEXT NOT NULL,
        stage       TEXT NOT NULL DEFAULT 'prospecting',
        value_azn   NUMERIC NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_deals_org ON tais_deals(org_id);
      CREATE INDEX tais_deals_customer ON tais_deals(customer_id);

      CREATE TABLE tais_activities (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        deal_id     TEXT REFERENCES tais_deals(id),
        type        TEXT NOT NULL,
        subject     TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_activities_org ON tais_activities(org_id);
      CREATE INDEX tais_activities_customer ON tais_activities(customer_id, occurred_at DESC);

      CREATE TABLE tais_service_requests (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        customer_id     TEXT NOT NULL REFERENCES tais_customers(id),
        location_id     TEXT NOT NULL REFERENCES tais_locations(id),
        category        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'open',
        matched_task_id TEXT REFERENCES tais_tasks(id),
        opened_at       TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_requests_org ON tais_service_requests(org_id, status);

      CREATE TABLE tais_complaints (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        location_id TEXT NOT NULL REFERENCES tais_locations(id),
        category    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        opened_at   TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_complaints_org ON tais_complaints(org_id, customer_id);

      CREATE TABLE tais_quality_issues (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        location_id TEXT NOT NULL REFERENCES tais_locations(id),
        category    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        opened_at   TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_quality_org ON tais_quality_issues(org_id);
    `,
  },
  {
    id: 17,
    name: "aksiyonlar: bagli risk referansi (karar-risk-aksiyon kanit zinciri)",
    sql: `
      -- Aksiyonun hangi risk kaydina dayandigini izler (orn. TAIS demo risk
      -- motorunun urettigi TaisRisk.id). FK DEGIL: riskler ayri, kalici bir
      -- tabloda tutulmuyor, ilgili veri anlik goruntusunden deterministik
      -- olarak hesaplaniyor (bkz. src/lib/demo/tais/risks.ts). Bu alan
      -- yalnizca izlenebilirlik/kanit zinciri icin serbest metin referanstir.
      ALTER TABLE actions ADD COLUMN related_risk_id TEXT;
    `,
  },
  {
    id: 18,
    name: "organizasyon hiyerarsisi (grup/sirket/sube) ve ulke/para birimi",
    approvalEnv: "ABYS_MIGRATION_18_APPROVED",
    sql: `
      -- Holding -> şirket -> şube ağacı. Eski kayıtlar 'company' olarak kalır.
      -- country ISO-3166-1 alpha-2 (ör. TR), currency ISO-4217 (ör. TRY).
      ALTER TABLE organizations ADD COLUMN parent_id TEXT REFERENCES organizations(id);
      ALTER TABLE organizations ADD COLUMN kind TEXT NOT NULL DEFAULT 'company';
      ALTER TABLE organizations ADD COLUMN country TEXT;
      ALTER TABLE organizations ADD COLUMN currency TEXT NOT NULL DEFAULT 'TRY';
      CREATE INDEX organizations_parent ON organizations(parent_id);
    `,
  },
  {
    id: 19,
    name: "veri kalitesi: karantina (kaynak, varlik, gerekce, ham satir)",
    sql: `
      -- Entegrasyonlarda eşleştirilemeyen/geçersiz satırlar burada tutulur;
      -- sessizce atılmaz veya tüm senkronu düşürmez. payload sır içermemeli.
      CREATE TABLE data_quality_issues (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        source      TEXT NOT NULL,
        entity      TEXT NOT NULL,
        source_ref  TEXT,
        reason      TEXT NOT NULL,
        payload     JSONB,
        status      TEXT NOT NULL DEFAULT 'pending', -- pending|resolved|discarded
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT
      );
      CREATE INDEX dq_org_status ON data_quality_issues(org_id, status, created_at DESC);
    `,
  },
  {
    id: 20,
    name: "konnektor SDK: konfigurasyon, senkron calistirmalari ve kanonik kayitlar",
    sql: `
      -- Kimlik bilgileri BURADA TUTULMAZ: config yalnızca ortam değişkeni
      -- adını (secretEnvVar) taşır. Kanonik kayıtlar sağlayıcıdan bağımsızdır
      -- ve (org, config, entity, external_id) üzerinden idempotent yazılır.
      CREATE TABLE connector_configs (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        connector_id TEXT NOT NULL,
        name         TEXT NOT NULL,
        config       JSONB NOT NULL,
        enabled      BOOLEAN NOT NULL DEFAULT true,
        created_by   TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX connector_configs_org ON connector_configs(org_id, connector_id);

      CREATE TABLE connector_sync_runs (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        config_id     TEXT NOT NULL REFERENCES connector_configs(id),
        status        TEXT NOT NULL, -- running|success|failed
        started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at   TIMESTAMPTZ,
        pages         INTEGER NOT NULL DEFAULT 0,
        read_count    INTEGER NOT NULL DEFAULT 0,
        written_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        checkpoint    TEXT,
        error         TEXT,
        warnings      JSONB
      );
      CREATE INDEX connector_runs_config ON connector_sync_runs(org_id, config_id, started_at DESC);

      CREATE TABLE connector_records (
        id                TEXT PRIMARY KEY,
        org_id            TEXT NOT NULL REFERENCES organizations(id),
        config_id         TEXT NOT NULL REFERENCES connector_configs(id),
        entity            TEXT NOT NULL,
        external_id       TEXT NOT NULL,
        data              JSONB NOT NULL,
        source_updated_at TIMESTAMPTZ,
        synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX connector_records_identity
        ON connector_records(org_id, config_id, entity, external_id);
      CREATE INDEX connector_records_org_entity ON connector_records(org_id, entity, synced_at DESC);
    `,
  },
  {
    id: 21,
    name: "is baglami: onayli profil, kpi kaynagi ve aktivasyon surumu",
    sql: `
      -- Keşif önerisinin yönetici tarafından onaylanmış sürümleri. snapshot,
      -- sınıflandırma kanıtlarını ve o anda gözlenen kanonik alan şemasını taşır;
      -- böylece sonraki veri değişimleri geçmiş kararları sessizce yeniden yazmaz.
      CREATE TABLE business_profiles (
        id                    TEXT PRIMARY KEY,
        org_id                TEXT NOT NULL REFERENCES organizations(id),
        version               INTEGER NOT NULL,
        status                TEXT NOT NULL DEFAULT 'confirmed',
        industry_pack_id      TEXT NOT NULL,
        industry_pack_version INTEGER NOT NULL,
        subsector_id          TEXT,
        confidence            INTEGER NOT NULL,
        source_fingerprint    TEXT NOT NULL,
        snapshot              JSONB NOT NULL,
        created_by            TEXT NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (org_id, version)
      );
      CREATE INDEX business_profiles_org_time
        ON business_profiles(org_id, created_at DESC);

      -- KPI tanımının kaynağı görünür olmalı: elle yazılmış bir tanımın sektör
      -- paketi aktivasyonuyla sessizce ezilmesini engellemek için ayrı alanlar.
      ALTER TABLE kpi_definitions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE kpi_definitions ADD COLUMN source_ref TEXT;
      CREATE INDEX kpi_definitions_org_source
        ON kpi_definitions(org_id, source, source_ref);
    `,
  },
  {
    id: 22,
    name: "konnektor: kanonik sozlesme reddi, kaynak sema ve esleme onerileri",
    sql: `
      -- Kaynak şeması yalnızca alan yolları ve JSON tiplerini taşır; kaynak
      -- değerleri veya kimlik bilgileri bu kolonlara yazılmaz. Reddedilen
      -- kayıtlar sessizce kaybolmaz; data_quality_issues ile çalıştırmaya bağlanır.
      ALTER TABLE connector_sync_runs ADD COLUMN rejected_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE connector_sync_runs ADD COLUMN source_schema JSONB;
      ALTER TABLE connector_sync_runs ADD COLUMN mapping_suggestions JSONB;

      ALTER TABLE data_quality_issues ADD COLUMN code TEXT;
      ALTER TABLE data_quality_issues ADD COLUMN connector_run_id TEXT REFERENCES connector_sync_runs(id);
      CREATE INDEX dq_connector_run
        ON data_quality_issues(org_id, connector_run_id, created_at DESC);
    `,
  },
  {
    id: 23,
    name: "varlik kimligi: kaynaklar arasi deterministik kanonik baglantilar",
    sql: `
      -- Kaynak kaydı silinmez; kimlik çözümlemesi ayrı, yeniden üretilebilir bir
      -- projeksiyondur. Yalnızca güçlü eşleşmeler (e-posta/SKU) kaynaklar arası
      -- birleşir. Ham e-posta veya SKU bu tabloya yazılmaz; yalnızca hash kimliği.
      CREATE TABLE canonical_entity_links (
        id                  TEXT PRIMARY KEY,
        org_id              TEXT NOT NULL REFERENCES organizations(id),
        canonical_entity_id TEXT NOT NULL,
        entity              TEXT NOT NULL,
        source_config_id    TEXT NOT NULL REFERENCES connector_configs(id),
        source_external_id  TEXT NOT NULL,
        match_strategy      TEXT NOT NULL,
        match_confidence    INTEGER NOT NULL CHECK (match_confidence BETWEEN 0 AND 100),
        resolved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (org_id, source_config_id, entity, source_external_id)
      );
      CREATE INDEX canonical_entity_links_identity
        ON canonical_entity_links(org_id, entity, canonical_entity_id);
      CREATE INDEX canonical_entity_links_source
        ON canonical_entity_links(org_id, source_config_id, entity, source_external_id);
    `,
  },
  {
    id: 24,
    name: "konnektor: zamanlanmis senkron, tetikleyici ve due indeksi",
    sql: `
      ALTER TABLE connector_configs
        ADD COLUMN schedule_interval_minutes INTEGER
          CHECK (schedule_interval_minutes IS NULL OR schedule_interval_minutes BETWEEN 5 AND 525600);
      ALTER TABLE connector_configs ADD COLUMN next_run_at TIMESTAMPTZ;
      ALTER TABLE connector_configs ADD COLUMN last_scheduled_at TIMESTAMPTZ;
      CREATE INDEX connector_configs_due
        ON connector_configs(next_run_at)
        WHERE enabled = true AND schedule_interval_minutes IS NOT NULL;

      -- Bir çalıştırmanın manuel mi yoksa zamanlayıcı tarafından mı başlatıldığı
      -- gözlemlenebilirlik için ayrı tutulur; eski kayıtlar manuel kabul edilir.
      ALTER TABLE connector_sync_runs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual';
      CREATE INDEX connector_runs_trigger
        ON connector_sync_runs(org_id, trigger, started_at DESC);
    `,
  },
  {
    id: 25,
    name: "karar defteri: sayisal beklenen ve gerceklesen ekonomik etki",
    sql: `
      -- Ekonomik etki yalnızca açık para birimi ve kanıtla sayısallaştırılır.
      -- Farklı para birimleri asla sessizce toplanmaz; mutabakat aynı para
      -- birimindeki beklenen/gerçekleşen çiftler üzerinden hesaplanır.
      ALTER TABLE decision_records ADD COLUMN expected_value NUMERIC;
      ALTER TABLE decision_records ADD COLUMN expected_value_low NUMERIC;
      ALTER TABLE decision_records ADD COLUMN expected_value_high NUMERIC;
      ALTER TABLE decision_records ADD COLUMN value_currency TEXT;
      ALTER TABLE decision_records ADD COLUMN value_basis TEXT;
      ALTER TABLE decision_records ADD COLUMN value_assumptions JSONB;
      ALTER TABLE decision_records ADD CONSTRAINT decision_expected_value_range CHECK (
        expected_value IS NULL OR (
          (expected_value_low IS NULL OR expected_value_low <= expected_value) AND
          (expected_value_high IS NULL OR expected_value_high >= expected_value)
        )
      );
      ALTER TABLE decision_records ADD CONSTRAINT decision_expected_currency CHECK (
        expected_value IS NULL OR value_currency ~ '^[A-Z]{3}$'
      );

      ALTER TABLE outcomes ADD COLUMN actual_value NUMERIC;
      ALTER TABLE outcomes ADD COLUMN value_currency TEXT;
      ALTER TABLE outcomes ADD COLUMN measurement_start TIMESTAMPTZ;
      ALTER TABLE outcomes ADD COLUMN measurement_end TIMESTAMPTZ;
      ALTER TABLE outcomes ADD COLUMN evidence TEXT;
      ALTER TABLE outcomes ADD CONSTRAINT outcome_actual_currency CHECK (
        actual_value IS NULL OR value_currency ~ '^[A-Z]{3}$'
      );
      ALTER TABLE outcomes ADD CONSTRAINT outcome_measurement_window CHECK (
        measurement_start IS NULL OR measurement_end IS NULL OR measurement_end >= measurement_start
      );
    `,
  },
  {
    id: 26,
    name: "kanonik altin kayit: kaynak guven sirasi",
    sql: `
      -- Altın kayıt, kaynak kayıtlarının üzerine yazılan ikinci bir gerçek
      -- değildir; alan bazında yeniden üretilebilir bir seçimdir. Düşük sayı
      -- daha yüksek güveni ifade eder. Politika yoksa kaynak güncellik sırası
      -- deterministik bir sonraki kuraldır.
      CREATE TABLE canonical_survivorship_policies (
        org_id           TEXT NOT NULL REFERENCES organizations(id),
        entity           TEXT NOT NULL,
        source_config_id TEXT NOT NULL REFERENCES connector_configs(id),
        priority         INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 1000),
        updated_by       TEXT NOT NULL,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (org_id, entity, source_config_id)
      );
      CREATE INDEX canonical_survivorship_policy_order
        ON canonical_survivorship_policies(org_id, entity, priority, source_config_id);
    `,
  },
  {
    id: 27,
    name: "dijital ikiz: kaynak kayit gecmisi",
    sql: `
      -- Kaynak kayıtları güncellenirken önceki gözlem kaybolmaz. Geçmiş satırı,
      -- ABYS'nin kaydı gördüğü zamanı (captured_at) ve o sırada geçerli
      -- kanonik kimliği taşır. Yalnızca içerik veya kimlik değiştiğinde satır
      -- eklenir; aynı senkronun tekrarı geçmişi şişirmez.
      CREATE TABLE connector_record_history (
        id                  TEXT PRIMARY KEY,
        org_id              TEXT NOT NULL REFERENCES organizations(id),
        config_id           TEXT NOT NULL REFERENCES connector_configs(id),
        entity              TEXT NOT NULL,
        external_id         TEXT NOT NULL,
        canonical_entity_id TEXT NOT NULL,
        data                JSONB NOT NULL,
        source_updated_at   TIMESTAMPTZ,
        captured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX connector_history_source
        ON connector_record_history(org_id, config_id, entity, external_id, captured_at DESC);
      CREATE INDEX connector_history_canonical
        ON connector_record_history(org_id, canonical_entity_id, captured_at DESC);
    `,
  },
  {
    id: 28,
    name: "konnektor eslemesi: onayli ve surumlu konfigurasyon gecmisi",
    sql: `
      -- Eşleme değişikliği mevcut konfigürasyonun üzerine sessizce yazılmaz.
      -- Her onaylı değişiklik append-only bir sürüm bırakır; böylece hangi
      -- alanın hangi kaynak şemaya göre, kim tarafından onaylandığı izlenir.
      ALTER TABLE connector_configs
        ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1
          CHECK (config_version > 0);

      CREATE TABLE connector_config_versions (
        id                    TEXT PRIMARY KEY,
        org_id                TEXT NOT NULL REFERENCES organizations(id),
        config_id             TEXT NOT NULL REFERENCES connector_configs(id),
        version               INTEGER NOT NULL CHECK (version > 0),
        config                JSONB NOT NULL,
        change_summary        TEXT NOT NULL,
        source_run_id         TEXT REFERENCES connector_sync_runs(id),
        approved_suggestions  JSONB NOT NULL DEFAULT '[]',
        created_by            TEXT NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (org_id, config_id, version)
      );
      CREATE INDEX connector_config_versions_time
        ON connector_config_versions(org_id, config_id, version DESC);

      -- Migration öncesindeki mevcut konfigürasyon da kaybolmadan 1. sürüm
      -- olarak arşivlenir. Backfill kimliği deterministiktir.
      INSERT INTO connector_config_versions
        (id, org_id, config_id, version, config, change_summary, created_by, created_at)
      SELECT md5(org_id || ':' || id), org_id, id, 1, config,
             'Mevcut konfigürasyon migration sırasında arşivlendi.', created_by, created_at
        FROM connector_configs
       ON CONFLICT (org_id, config_id, version) DO NOTHING;
    `,
  },
  {
    id: 29,
    name: "konnektor esleme surumleri: append-only korumasi",
    sql: `
      -- Onaylı eşleme snapshot'ları değiştirilemez veya silinemez. Repository
      -- yolu zaten yalnızca INSERT yapar; bu trigger doğrudan SQL hatasına karşı
      -- savunma derinliği sağlar.
      CREATE OR REPLACE FUNCTION prevent_connector_config_version_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'connector_config_versions append-only: UPDATE/DELETE yasak';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER connector_config_versions_append_only
        BEFORE UPDATE OR DELETE ON connector_config_versions
        FOR EACH ROW EXECUTE FUNCTION prevent_connector_config_version_mutation();
    `,
  },
  {
    id: 30,
    name: "aksiyon yonetisimi: degismez yurutme olaylari",
    sql: `
      -- Aksiyon durumları serbest metin olarak sessizce değiştirilmez. Her
      -- geçiş, aktörü ve gerekçe/ilerleme notuyla birlikte append-only bir
      -- olay bırakır. Aksiyonun mevcut durumu ile olay geçmişi birbirinden
      -- bağımsız iki gerçek değildir; repository ikisini tek transaction'da
      -- yazar. Karar durumu da yürütme geçişleriyle bağlantılıdır.
      CREATE TABLE action_events (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        action_id     TEXT NOT NULL REFERENCES actions(id),
        decision_id   TEXT NOT NULL REFERENCES decision_records(id),
        from_status   TEXT,
        to_status     TEXT NOT NULL,
        progress_note TEXT,
        actor_id      TEXT NOT NULL,
        actor_name    TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX action_events_action
        ON action_events(org_id, action_id, created_at DESC, id DESC);
      CREATE INDEX action_events_decision
        ON action_events(org_id, decision_id, created_at DESC);

      CREATE OR REPLACE FUNCTION prevent_action_event_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'action_events append-only: UPDATE/DELETE yasak';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER action_events_append_only
        BEFORE UPDATE OR DELETE ON action_events
        FOR EACH ROW EXECUTE FUNCTION prevent_action_event_mutation();
    `,
  },
  {
    id: 31,
    name: "yurutme hazirligi: idempotent execution intent",
    sql: `
      -- Dış sistem çağrısı yapılmadan önce hazırlanan niyet kaydı. Aynı
      -- idempotency anahtarı ikinci kez aynı içerikle gelirse mevcut kayıt
      -- döner; farklı aksiyon/içerikle gelirse sessizce ezilmez.
      CREATE TABLE action_execution_intents (
        id                TEXT PRIMARY KEY,
        org_id            TEXT NOT NULL REFERENCES organizations(id),
        action_id         TEXT NOT NULL REFERENCES actions(id),
        decision_id       TEXT NOT NULL REFERENCES decision_records(id),
        idempotency_key   TEXT NOT NULL,
        mode              TEXT NOT NULL CHECK (mode IN ('manual', 'system')),
        target_system     TEXT,
        summary           TEXT NOT NULL,
        payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
        payload_hash      TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'prepared'
                            CHECK (status IN ('prepared', 'approved', 'cancelled')),
        prepared_by_id    TEXT NOT NULL,
        prepared_by_name  TEXT NOT NULL,
        approved_by_id    TEXT,
        approved_by_name  TEXT,
        approved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (org_id, idempotency_key)
      );
      CREATE INDEX action_execution_intents_action
        ON action_execution_intents(org_id, action_id, created_at DESC);
      CREATE INDEX action_execution_intents_status
        ON action_execution_intents(org_id, status, created_at DESC);
    `,
  },
  {
    id: 32,
    name: "guvenli yurutme: intent basina tek denetlenebilir adaptor denemesi",
    sql: `
      -- Onaylı niyetin dış adaptöre en fazla bir kez gönderilmesini sağlayan
      -- deneme kaydı. Aynı intent için ikinci eşzamanlı deneme unique index ile
      -- reddedilir; başarı/başarısızlık ve sağlayıcı referansı burada tutulur.
      CREATE TABLE action_execution_attempts (
        id                TEXT PRIMARY KEY,
        org_id            TEXT NOT NULL REFERENCES organizations(id),
        intent_id         TEXT NOT NULL REFERENCES action_execution_intents(id),
        action_id         TEXT NOT NULL REFERENCES actions(id),
        decision_id       TEXT NOT NULL REFERENCES decision_records(id),
        adapter_id        TEXT NOT NULL,
        target_system     TEXT NOT NULL,
        idempotency_key   TEXT NOT NULL,
        payload_hash      TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'succeeded', 'failed')),
        response_status   INTEGER,
        response_reference TEXT,
        error_code        TEXT,
        error_message     TEXT,
        actor_id          TEXT NOT NULL,
        actor_name        TEXT NOT NULL,
        started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at       TIMESTAMPTZ,
        UNIQUE (org_id, intent_id)
      );
      CREATE INDEX action_execution_attempts_action
        ON action_execution_attempts(org_id, action_id, started_at DESC);
      CREATE INDEX action_execution_attempts_status
        ON action_execution_attempts(org_id, status, started_at DESC);
    `,
  },
  {
    id: 33,
    name: "karar kaniti: sinyal-vaka arasinda acik ve denetlenebilir bag",
    sql: `
      -- Bir sinyal vaka kanıtı sayılacaksa bunun açık bir bağı olmalıdır.
      -- Benzer başlık/sektör gibi zayıf sezgilerle otomatik eşleme yapılmaz.
      CREATE TABLE decision_case_signals (
        id             TEXT PRIMARY KEY,
        org_id         TEXT NOT NULL REFERENCES organizations(id),
        case_id        TEXT NOT NULL REFERENCES decision_cases(id),
        signal_id      TEXT NOT NULL REFERENCES signals(id),
        link_reason    TEXT NOT NULL,
        linked_by_id   TEXT NOT NULL,
        linked_by_name TEXT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (org_id, case_id, signal_id)
      );
      CREATE INDEX decision_case_signals_case
        ON decision_case_signals(org_id, case_id, created_at DESC);
      CREATE INDEX decision_case_signals_signal
        ON decision_case_signals(org_id, signal_id);
    `,
  },
  {
    id: 34,
    name: "nedensel kanit ust verisi: yontem, orneklem, veri kalitesi, belirsizlik",
    sql: `
      -- Kanıt seviyesi yalnızca ilişki durumundan değil; çalışma yöntemi,
      -- örneklem büyüklüğü, veri kalitesi ve belirsizlikten birlikte türetilir
      -- (bkz. src/lib/causal-evidence.ts). Bağlantı oluşturulurken bu üst veri
      -- isteğe bağlı kaydedilir; yoksa değerlendirme temkinli kalır.
      ALTER TABLE causal_links
        ADD COLUMN IF NOT EXISTS method TEXT,
        ADD COLUMN IF NOT EXISTS sample_size INTEGER
          CHECK (sample_size IS NULL OR (sample_size >= 0 AND sample_size <= 100000000)),
        ADD COLUMN IF NOT EXISTS data_quality TEXT
          CHECK (data_quality IS NULL OR data_quality IN ('high', 'medium', 'low')),
        ADD COLUMN IF NOT EXISTS uncertainty TEXT
          CHECK (uncertainty IS NULL OR uncertainty IN ('low', 'medium', 'high'));
    `,
  },
  {
    id: 35,
    name: "tahmin anlik goruntusu: gerceklesen degerle karsilastirma",
    sql: `
      -- Bir tahmin uretildigi andaki ilk adımı (P10/P50/P90) saklar. Sonraki
      -- KPI gözlemi geldiğinde bu anlık görüntü gerçek değerle karşılaştırılır;
      -- böylece "tahmin ettik, ölçtük" döngüsü uydurma metrik olmadan kurulur.
      CREATE TABLE forecast_snapshots (
        id               TEXT PRIMARY KEY,
        org_id           TEXT NOT NULL REFERENCES organizations(id),
        label            TEXT NOT NULL,
        model            TEXT NOT NULL,
        evidence         TEXT NOT NULL,
        horizon          INTEGER NOT NULL CHECK (horizon BETWEEN 1 AND 12),
        series_points    INTEGER NOT NULL CHECK (series_points >= 6),
        p10              DOUBLE PRECISION NOT NULL,
        p50              DOUBLE PRECISION NOT NULL,
        p90              DOUBLE PRECISION NOT NULL,
        last_observed_at TIMESTAMPTZ NOT NULL,
        created_by       TEXT NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX forecast_snapshots_org_label
        ON forecast_snapshots(org_id, label, created_at DESC);
    `,
  },
  {
    id: 36,
    name: "oturum cihazi ve son gorulme",
    sql: `
      -- Oturum sahibi kendi cihazlarını ayırt edebilsin ve son kullanım
      -- zamanını görebilsin. User-Agent yalnızca sahibine döner; IP gibi ek
      -- kişisel veri saklanmaz. Eski satırlar başlangıç değeriyle doldurulur.
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
    `,
  },
];
